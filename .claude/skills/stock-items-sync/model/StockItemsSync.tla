--------------------------- MODULE StockItemsSync ---------------------------
(***************************************************************************)
(* How the /stock-items client keeps `items` in step with the DB.          *)
(*                                                                         *)
(* Code (frontend/src/app/stock-items/useStockItems.ts):                   *)
(*   handleRealtimeChange      -> Deliver + Resolve(kind "realtime")       *)
(*   handleCreate / handleSave / handleToggleWantToBuy /                   *)
(*   handleConfirmDelete / handleImageSelect                               *)
(*                             -> SelfWrite, IssueMutationRefetch,         *)
(*                                Resolve(kind "mutation")                 *)
(* frontend/src/lib/useStockItemsRealtime.ts:                              *)
(*   postgres_changes callback and the SUBSCRIBED callback -> Deliver      *)
(* backend GET /api/stock-items (repository List)  -> Read                 *)
(*                                                                         *)
(* The DB state of the active group is abstracted to a version number:    *)
(* every committed write (by this tab or another family member) bumps it.  *)
(* A fetch is three steps that the network can interleave freely: the     *)
(* client issues it, the server reads the DB (one SELECT, so one atomic    *)
(* step), and the response reaches setItems.                               *)
(***************************************************************************)
EXTENDS Integers, FiniteSets

CONSTANTS
    MaxWrites,      \* bound on committed writes in one behavior
    GuardRealtime,  \* realtime refetch result applied only if newest so far
    GuardMutation   \* same guard for the refetch after a mutation

NoSnap == -1

VARIABLES
    db,          \* version of the group's rows in Postgres
    shown,       \* version currently held in React state `items`
    notes,       \* Realtime callbacks not yet run (postgres_changes / SUBSCRIBED)
    mutPending,  \* own writes whose `await fetchStockItems` is not yet issued
    fetches,     \* in-flight fetches: [seq, kind, snap]
    nextSeq,     \* issue order of fetches
    applied,     \* seq of the newest response applied (used by the guards)
    writes       \* committed writes so far

vars == <<db, shown, notes, mutPending, fetches, nextSeq, applied, writes>>

Kinds == {"realtime", "mutation"}

TypeOK ==
    /\ db \in Nat /\ shown \in Nat /\ notes \in Nat /\ mutPending \in Nat
    /\ \A f \in fetches : f.kind \in Kinds /\ f.snap \in Nat \cup {NoSnap}
    /\ writes <= MaxWrites

(* Mount: `items` = SSR initialItems at version 0. The channel's first     *)
(* SUBSCRIBED status will call onChange once.                              *)
Init ==
    /\ db = 0
    /\ shown = 0
    /\ notes = 1
    /\ mutPending = 0
    /\ fetches = {}
    /\ nextSeq = 1
    /\ applied = 0
    /\ writes = 0

Issue(kind) ==
    /\ fetches' = fetches \cup {[seq |-> nextSeq, kind |-> kind, snap |-> NoSnap]}
    /\ nextSeq' = nextSeq + 1

(* Another device writes; Supabase Realtime will notify this tab.          *)
RemoteWrite ==
    /\ writes < MaxWrites
    /\ db' = db + 1
    /\ writes' = writes + 1
    /\ notes' = notes + 1
    /\ UNCHANGED <<shown, mutPending, fetches, nextSeq, applied>>

(* This tab's create/update/delete commits. Realtime notifies this tab of  *)
(* its own write too, and the handler will refetch after `await`.          *)
SelfWrite ==
    /\ writes < MaxWrites
    /\ db' = db + 1
    /\ writes' = writes + 1
    /\ notes' = notes + 1
    /\ mutPending' = mutPending + 1
    /\ UNCHANGED <<shown, fetches, nextSeq, applied>>

(* Realtime callback runs onChangeRef.current() = handleRealtimeChange.    *)
Deliver ==
    /\ notes > 0
    /\ notes' = notes - 1
    /\ Issue("realtime")
    /\ UNCHANGED <<db, shown, mutPending, applied, writes>>

IssueMutationRefetch ==
    /\ mutPending > 0
    /\ mutPending' = mutPending - 1
    /\ Issue("mutation")
    /\ UNCHANGED <<db, shown, notes, applied, writes>>

(* The Go API runs its SELECT for this request.                            *)
Read(f) ==
    /\ f.snap = NoSnap
    /\ fetches' = (fetches \ {f}) \cup {[f EXCEPT !.snap = db]}
    /\ UNCHANGED <<db, shown, notes, mutPending, nextSeq, applied, writes>>

Guarded(f) == IF f.kind = "realtime" THEN GuardRealtime ELSE GuardMutation

(* The response reaches `.then((data) => setItems(data))`. Unguarded code *)
(* applies whatever arrives; a guard drops responses older than one       *)
(* already applied.                                                        *)
Resolve(f) ==
    /\ f.snap # NoSnap
    /\ fetches' = fetches \ {f}
    /\ IF Guarded(f) /\ f.seq < applied
          THEN UNCHANGED <<shown, applied>>
          ELSE /\ shown' = f.snap
               /\ applied' = IF f.seq > applied THEN f.seq ELSE applied
    /\ UNCHANGED <<db, notes, mutPending, nextSeq, writes>>

Next ==
    \/ RemoteWrite
    \/ SelfWrite
    \/ Deliver
    \/ IssueMutationRefetch
    \/ \E f \in fetches : Read(f) \/ Resolve(f)

Spec == Init /\ [][Next]_vars

(***************************************************************************)
(* Property: once nothing is pending (no Realtime callback waiting, no     *)
(* refetch waiting to be issued, no fetch in flight), the list on screen   *)
(* is the DB's current list.                                               *)
(***************************************************************************)
Settled == notes = 0 /\ mutPending = 0 /\ fetches = {}

SettledShowsLatest == Settled => shown = db
=============================================================================
