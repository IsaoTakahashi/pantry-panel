import { useCallback, useEffect, useRef, useState } from "react";
import {
  createStockItem,
  deleteStockItem,
  fetchStockItems,
  updateStockItem,
} from "@/lib/api";
import { createGroup, updateGroupName } from "@/lib/authApi";
import { useStockItemsRealtime } from "@/lib/useStockItemsRealtime";
import type { StockItem } from "@/types/stockItem";

type Prefill = {
  name: string;
  imageUrl: string | null;
  sourceUrl: string | null;
};

type UseStockItemsReturn = {
  items: StockItem[];
  loading: boolean;
  error: string | null;
  isModalOpen: boolean;
  urlModalOpen: boolean;
  prefill: Prefill;
  editingItem: StockItem | null;
  imageEditingItem: StockItem | null;
  confirmDeleteItem: StockItem | null;
  handleCreate: (
    name: string,
    category: string,
    wantToBuy: boolean,
    imageUrl: string | null,
    sourceUrl: string | null,
  ) => Promise<void>;
  handleSave: (name: string, category: string) => Promise<void>;
  handleToggleWantToBuy: (item: StockItem) => Promise<void>;
  handleDelete: (item: StockItem) => void;
  handleCancelDelete: () => void;
  handleConfirmDelete: () => Promise<void>;
  handleOpenEdit: (item: StockItem) => void;
  handleCloseEdit: () => void;
  handleOpenImageEdit: (item: StockItem) => void;
  handleCloseImageEdit: () => void;
  handleImageSelect: (imageUrl: string | null) => Promise<void>;
  handleRenameGroup: (groupId: string, name: string) => Promise<void>;
  handleCreateNewGroup: (name: string) => Promise<void>;
  handleExtracted: (
    name: string,
    imageUrl: string | null,
    sourceUrl: string,
  ) => void;
  handleCloseCreateModal: () => void;
  setIsModalOpen: (open: boolean) => void;
  setUrlModalOpen: (open: boolean) => void;
};

export function useStockItems(
  accessToken: string | undefined,
  effectiveGroupId: string | undefined,
  refreshGroup: () => Promise<void>,
  isGroupConfirmed: boolean,
): UseStockItemsReturn {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill>({
    name: "",
    imageUrl: null,
    sourceUrl: null,
  });
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [imageEditingItem, setImageEditingItem] = useState<StockItem | null>(
    null,
  );
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<StockItem | null>(
    null,
  );

  // レビュー指摘の修正: 推測フェーズのフェッチが失敗し、かつ後から確定した
  // effectiveGroupId が失敗時と同じ id だった場合、Decision 2（依存配列不変で
  // 再実行スキップ）と Decision 4（推測フェーズの失敗は error に出さない）が
  // 組み合わさると、失敗が永久に握りつぶされ items が空のまま何も表示されない
  // 状態になる（一時的なネットワーク障害でも再試行されない）。この ref は
  // 「現在の effectiveGroupId に対する直近の推測フェッチが失敗したか」を記録し、
  // state ではなく ref で持つことで、記録すること自体が再レンダー/再実行の
  // トリガーにならないようにする。
  const speculativeFailureRef = useRef<string | undefined>(undefined);
  // 上記の再試行を main fetch effect に伝える唯一の手段。isGroupConfirmed 自体は
  // 引き続き依存配列に含めない（Decision 2 を維持し、成功済みの推測フェッチに対する
  // 不要な再フェッチを起こさないため）。
  const [retryTick, setRetryTick] = useState(0);

  // レビュー指摘の修正（round 2）: 上記の再試行トリガー effect は自身の依存配列
  // （[isGroupConfirmed, effectiveGroupId]）が変化した時にしか実行されない。
  // 「確定が先に来て（そのときはまだ ref が未設定で no-op）、その後にフェッチが
  // 失敗する」という順序では、失敗が記録された時点でこの effect の依存配列は
  // もう二度と変化せず、記録された失敗が永久に見過ごされる。これを防ぐため、
  // catch 処理では effect 開始時点のスナップショット（過去の
  // wasConfirmedAtFetchStart）ではなく、catch が実際に実行される瞬間の最新の
  // isGroupConfirmed をこの ref から読む。毎レンダーで直接代入するだけなので
  // useEffect は不要（"常に最新値を指す ref" の標準パターン）。
  const isGroupConfirmedRef = useRef(isGroupConfirmed);
  isGroupConfirmedRef.current = isGroupConfirmed;

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryTick is a deliberate re-run trigger only (bumped by the retry-trigger effect below) — its value is never read in the body, so Biome sees it as "unnecessary", but removing it would break the round-1 retry mechanism (Decision 2: effectiveGroupId alone must not force a re-run when unchanged).
  useEffect(() => {
    // effectiveGroupId が無ければ fetch しない（確定値も推測値も無い初回ログイン等）。
    // 値がある場合は確定/推測を問わずただちに fetch する。推測値→確定値のように
    // effectiveGroupId 自体が変化すれば依存配列の変化で自動的に再フェッチされ、
    // 変化しなければ（推測値=確定値）React が自動的に再実行をスキップする。
    if (!effectiveGroupId) return;

    // effectiveGroupId が実際に変わっていたら、古い id に対する失敗記録は無効。
    // 新しい id の結果でこの後上書きされる。
    if (speculativeFailureRef.current !== effectiveGroupId) {
      speculativeFailureRef.current = undefined;
    }

    // 推測フェッチと確定フェッチが短時間に連続発火しうるため、ネットワーク応答が
    // 逆順で返ってきても新しい fetch の結果が古い fetch の結果に上書きされないよう
    // ガードする。
    let cancelled = false;

    setLoading(true);
    setError(null);
    fetchStockItems(accessToken, effectiveGroupId)
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        if (speculativeFailureRef.current === effectiveGroupId) {
          speculativeFailureRef.current = undefined;
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // cancelled が false ということは、この fetch を開始してから
        // effectiveGroupId が変わっていない（変われば cleanup で cancelled = true
        // になる）＝ここでの isGroupConfirmedRef.current は「今まさに失敗した、
        // この同じ id」の確定状態を指す。effect 開始時点のスナップショット
        // （旧 wasConfirmedAtFetchStart）だと、「確定が先に来て（まだ ref 未設定で
        // no-op）、その後にフェッチが失敗する」という順序を取りこぼす
        // （round 2 で判明した抜け）ため、必ず catch 実行時点の最新値を読む。
        //
        // 推測フェーズ（未確定）のフェッチ失敗はユーザーに見せない。キャッシュされた
        // groupId が古い（脱退済み・別アカウントの残留キャッシュ）ことによる 403 等は
        // 実装の都合であり、確定フェッチの結果のみが正となる。
        if (isGroupConfirmedRef.current) {
          setError(err instanceof Error ? err.message : "操作に失敗しました");
        } else {
          // この id に対する確定はまだ来ていない。403 のような「古い id だから
          // 失敗した」ケースと、単なる一時的なネットワーク障害を実装上区別できない
          // ため、後で同じ id が確定した際に一度だけ再試行できるよう記録しておく
          // （下の retry effect 参照）。
          speculativeFailureRef.current = effectiveGroupId;
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, effectiveGroupId, retryTick]);

  // レビュー指摘の修正: 推測フェーズで失敗した effectiveGroupId が、そのまま同じ id
  // で確定した場合に限り、一度だけ再フェッチを起こす。main fetch effect は
  // isGroupConfirmed を依存配列に含めない（Decision 2）ため、id が変わらない
  // 確定では自動的には再実行されない。ここで retryTick を 1 つ進めることでのみ
  // 再実行させる。id が一致しなければ（= 通常は effectiveGroupId 自体の変化で
  // 再フェッチされるケース）何もしない。再試行を積んだ直後に記録をクリアするため、
  // 再試行自体が失敗しても無限ループにはならない（2 回目は確定済みなので
  // Decision 4 の抑制は効かず、通常どおり error が可視化されて終端する）。
  useEffect(() => {
    if (
      isGroupConfirmed &&
      speculativeFailureRef.current === effectiveGroupId
    ) {
      speculativeFailureRef.current = undefined;
      setRetryTick((t) => t + 1);
    }
  }, [isGroupConfirmed, effectiveGroupId]);

  const handleRealtimeChange = useCallback(() => {
    fetchStockItems(accessToken, effectiveGroupId)
      .then((data) => setItems(data))
      .catch(() => {});
  }, [accessToken, effectiveGroupId]);

  useStockItemsRealtime(handleRealtimeChange);

  const handleCreate = async (
    name: string,
    category: string,
    wantToBuy: boolean,
    imageUrl: string | null,
    sourceUrl: string | null,
  ): Promise<void> => {
    const created = await createStockItem(
      { name, category, wantToBuy, sourceUrl: sourceUrl ?? undefined },
      accessToken,
      effectiveGroupId,
    );
    if (imageUrl) {
      await updateStockItem(
        created.id,
        { imageUrl },
        accessToken,
        effectiveGroupId,
      );
    }
    const data = await fetchStockItems(accessToken, effectiveGroupId);
    setItems(data);
  };

  const handleSave = async (name: string, category: string): Promise<void> => {
    if (!editingItem) return;
    try {
      await updateStockItem(
        editingItem.id,
        { name, category },
        accessToken,
        effectiveGroupId,
      );
      const data = await fetchStockItems(accessToken, effectiveGroupId);
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleToggleWantToBuy = async (item: StockItem): Promise<void> => {
    const previousItems = [...items];
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, wantToBuy: !item.wantToBuy } : i,
      ),
    );
    try {
      await updateStockItem(
        item.id,
        { wantToBuy: !item.wantToBuy },
        accessToken,
        effectiveGroupId,
      );
      const data = await fetchStockItems(accessToken, effectiveGroupId);
      setItems(data);
      setError(null);
    } catch (err) {
      setItems(previousItems);
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleDelete = (item: StockItem): void => {
    setConfirmDeleteItem(item);
  };

  const handleCancelDelete = (): void => {
    setConfirmDeleteItem(null);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!confirmDeleteItem) return;
    try {
      await deleteStockItem(
        confirmDeleteItem.id,
        accessToken,
        effectiveGroupId,
      );
      setConfirmDeleteItem(null);
      const data = await fetchStockItems(accessToken, effectiveGroupId);
      setItems(data);
      setError(null);
    } catch (err) {
      setConfirmDeleteItem(null);
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleOpenEdit = (item: StockItem): void => {
    setEditingItem(item);
  };

  const handleCloseEdit = (): void => {
    setEditingItem(null);
  };

  const handleOpenImageEdit = (item: StockItem): void => {
    setImageEditingItem(item);
  };

  const handleImageSelect = async (imageUrl: string | null): Promise<void> => {
    if (!imageEditingItem) return;
    try {
      await updateStockItem(
        imageEditingItem.id,
        { imageUrl },
        accessToken,
        effectiveGroupId,
      );
      setImageEditingItem(null);
      const data = await fetchStockItems(accessToken, effectiveGroupId);
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleRenameGroup = async (
    groupId: string,
    name: string,
  ): Promise<void> => {
    if (!accessToken || !effectiveGroupId) return;
    try {
      await updateGroupName(groupId, name, accessToken, effectiveGroupId);
      await refreshGroup();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleCreateNewGroup = async (name: string): Promise<void> => {
    if (!accessToken) return;
    try {
      await createGroup(name, accessToken);
      await refreshGroup();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleCloseCreateModal = (): void => {
    setIsModalOpen(false);
    setPrefill({ name: "", imageUrl: null, sourceUrl: null });
  };

  const handleCloseImageEdit = (): void => {
    setImageEditingItem(null);
  };

  const handleExtracted = (
    name: string,
    imageUrl: string | null,
    sourceUrl: string,
  ): void => {
    setUrlModalOpen(false);
    setPrefill({ name, imageUrl, sourceUrl });
    setIsModalOpen(true);
  };

  return {
    items,
    loading,
    error,
    isModalOpen,
    urlModalOpen,
    prefill,
    editingItem,
    imageEditingItem,
    confirmDeleteItem,
    handleCreate,
    handleSave,
    handleToggleWantToBuy,
    handleDelete,
    handleCancelDelete,
    handleConfirmDelete,
    handleOpenEdit,
    handleCloseEdit,
    handleOpenImageEdit,
    handleCloseImageEdit,
    handleImageSelect,
    handleRenameGroup,
    handleCreateNewGroup,
    handleExtracted,
    handleCloseCreateModal,
    setIsModalOpen,
    setUrlModalOpen,
  };
}
