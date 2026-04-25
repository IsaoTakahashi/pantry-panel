const CATEGORIES = [
  "★",
  "こども",
  "洗面",
  "100均",
  "KALDI",
  "調味料",
  "飲み物",
  "缶詰",
  "おかず",
  "おかずの素",
  "おやつ",
  "その他",
] as const;

type Category = (typeof CATEGORIES)[number];

export type { Category };
export { CATEGORIES };
