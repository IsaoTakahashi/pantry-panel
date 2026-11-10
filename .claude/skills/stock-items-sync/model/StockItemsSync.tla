--------------------------- MODULE StockItemsSync ---------------------------
(***************************************************************************)
(* How the /stock-items client keeps `items` in step with the DB.          *)
(*                                                                         *)
(* Every path that does `fetchStockItems(...)` then `setItems(data)` for   *)
(* the same group is a fetch "kind":                                       *)
(*   "realtime" handleRealtimeChange (useStockItems.ts), called by the     *)
(*              postgres_changes and SUBSCRIBED callbacks in               *)
(*              useStockItemsRealtime.ts                                   *)
(*   "mutation" the refetch after `await` in handleCreate / handleSave /   *)
(*              handleToggleWantToBuy / handleConfirmDelete /              *)
(*              handleImageSelect                                          *)
(*   "token"    the main fetch effect, re-run when accessToken changes     *)
(*              (AuthContext setSession on TOKEN_REFRESHED). Its cleanup   *)
(*              sets `cancelled`, so a run's response is dropped once a    *)
(*              newer run has started.                                     *)
(* backend GET /api/stock-items (repository List, one SELECT) -> Read      *)
(*                                                                         *)
(* The DB state of the active group is abstracted to a version number:    *)
(* every committed write (by this tab or another family member) bumps it.  *)
(* A fetch is three steps that the network can interleave freely: the     *)
(* client issues it, the server reads the DB (one SELECT, so one atomic    *)
(* step), and the response reaches setItems.                               *)
(***************************************************************************)
EXTENDS Integers, FiniteSets

CONSTANTS
    MaxWrites,         \* bound on committed writes in one behavior
    MaxTokenRefreshes, \* bound on accessToken changes in one behavior
    Guard              \* how responses are filtered before setItems:
                       \*  "none"         as the code is at the sync commit
                       \*  "realtimeOnly" handleRealtimeChange drops responses
                       \*                 older than its own newest applied one
                       \*  "perPath"      every kind does that with its own counter
                       \*  "shared"       one sequence across all kinds: drop a
                       \*                 response issued before any applied one

ASSUME Guard \in {"none", "realtimeOnly", "perPath", "shared"}

NoSnap == -1
Kinds == {"realtime", "mutation", "token"}

VARIABLES
    db,          \* version of the group's rows in Postgres
    shown,       \* version currently held in React state `items`
    notes,       \* Realtime callbacks not yet run (postgres_changes / SUBSCRIBED)
    mutPending,  \* own writes whose `await fetchStockItems` is not yet issued
    fetches,     \* in-flight fetches: [seq, kind, snap]
    nextSeq,     \* issue order of fetches (one global order)
    appliedBy,   \* per kind: seq of the newest response of that kind applied
    lastToken,   \* seq of the newest main-effect run (its `cancelled` is false)
    writes,      \* committed writes so far
    refreshes    \* accessToken changes so far

vars == <<db, shown, notes, mutPending, fetches, nextSeq, appliedBy, lastToken,
          writes, refreshes>>

TypeOK ==
    /\ db \in Nat /\ shown \in Nat /\ notes \in Nat /\ mutPending \in Nat
    /\ \A f \in fetches : f.kind \in Kinds /\ f.snap \in Nat \cup {NoSnap}
    /\ appliedBy \in [Kinds -> Nat]
    /\ writes <= MaxWrites /\ refreshes <= MaxTokenRefreshes

(* Mount: `items` = SSR initialItems at version 0 and the first main-effect *)
(* run is skipped (consumedInitialItemsRef). The channel's first           *)
(* SUBSCRIBED status will call onChange once.                              *)
Init ==
    /\ db = 0
    /\ shown = 0
    /\ notes = 1
    /\ mutPending = 0
    /\ fetches = {}
    /\ nextSeq = 1
    /\ appliedBy = [k \in Kinds |-> 0]
    /\ lastToken = 0
    /\ writes = 0
    /\ refreshes = 0

Issue(kind) ==
    /\ fetches' = fetches \cup {[seq |-> nextSeq, kind |-> kind, snap |-> NoSnap]}
    /\ nextSeq' = nextSeq + 1

(* Another device writes; Supabase Realtime will notify this tab.          *)
RemoteWrite ==
    /\ writes < MaxWrites
    /\ db' = db + 1
    /\ writes' = writes + 1
    /\ notes' = notes + 1
    /\ UNCHANGED <<shown, mutPending, fetches, nextSeq, appliedBy, lastToken, refreshes>>

(* This tab's create/update/delete commits. Realtime notifies this tab of  *)
(* its own write too, and the handler will refetch after `await`.          *)
SelfWrite ==
    /\ writes < MaxWrites
    /\ db' = db + 1
    /\ writes' = writes + 1
    /\ notes' = notes + 1
    /\ mutPending' = mutPending + 1
    /\ UNCHANGED <<shown, fetches, nextSeq, appliedBy, lastToken, refreshes>>

(* Realtime callback runs onChangeRef.current() = handleRealtimeChange.    *)
Deliver ==
    /\ notes > 0
    /\ notes' = notes - 1
    /\ Issue("realtime")
    /\ UNCHANGED <<db, shown, mutPending, appliedBy, lastToken, writes, refreshes>>

IssueMutationRefetch ==
    /\ mutPending > 0
    /\ mutPending' = mutPending - 1
    /\ Issue("mutation")
    /\ UNCHANGED <<db, shown, notes, appliedBy, lastToken, writes, refreshes>>

(* accessToken changes: the main fetch effect cleans up (cancelled = true *)
(* for the previous run) and starts a new fetch.                           *)
TokenRefresh ==
    /\ refreshes < MaxTokenRefreshes
    /\ refreshes' = refreshes + 1
    /\ lastToken' = nextSeq
    /\ Issue("token")
    /\ UNCHANGED <<db, shown, notes, mutPending, appliedBy, writes>>

(* The Go API runs its SELECT for this request.                            *)
Read(f) ==
    /\ f.snap = NoSnap
    /\ fetches' = (fetches \ {f}) \cup {[f EXCEPT !.snap = db]}
    /\ UNCHANGED <<db, shown, notes, mutPending, nextSeq, appliedBy, lastToken,
                   writes, refreshes>>

MaxApplied == CHOOSE m \in {appliedBy[k] : k \in Kinds} :
                  \A k \in Kinds : appliedBy[k] <= m

(* TRUE when the response of f never reaches setItems.                     *)
Dropped(f) ==
    \/ f.kind = "token" /\ f.seq # lastToken      \* `if (cancelled) return;`
    \/ Guard = "realtimeOnly" /\ f.kind = "realtime" /\ f.seq < appliedBy["realtime"]
    \/ Guard = "perPath" /\ f.seq < appliedBy[f.kind]
    \/ Guard = "shared" /\ f.seq < MaxApplied

Resolve(f) ==
    /\ f.snap # NoSnap
    /\ fetches' = fetches \ {f}
    /\ IF Dropped(f)
          THEN UNCHANGED <<shown, appliedBy>>
          ELSE /\ shown' = f.snap
               /\ appliedBy' = [appliedBy EXCEPT ![f.kind] =
                                   IF f.seq > @ THEN f.seq ELSE @]
    /\ UNCHANGED <<db, notes, mutPending, nextSeq, lastToken, writes, refreshes>>

Next ==
    \/ RemoteWrite
    \/ SelfWrite
    \/ Deliver
    \/ IssueMutationRefetch
    \/ TokenRefresh
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
