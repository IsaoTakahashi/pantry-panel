import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FilterCondition } from "@/lib/filterStockItems";
import FilterBar from "./FilterBar";

const baseValue: FilterCondition = {
  searchText: "",
  wantToBuyOnly: false,
  category: null,
};

describe("FilterBar", () => {
  it("検索テキストを入力すると onChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterBar value={baseValue} onChange={onChange} />);

    await user.type(screen.getByRole("searchbox"), "醤");
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      searchText: "醤",
    });
  });

  it("クリアボタンをクリックすると検索テキストが空になり onChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        value={{ ...baseValue, searchText: "醤油" }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "クリア" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      searchText: "",
    });
  });

  it("検索テキストが空のときクリアボタンは表示されない", () => {
    render(<FilterBar value={baseValue} onChange={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: "クリア" }),
    ).not.toBeInTheDocument();
  });

  it("「買いたいものだけ」チェックボックスをクリックすると onChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterBar value={baseValue} onChange={onChange} />);

    await user.click(
      screen.getByRole("checkbox", { name: "買いたいものだけ" }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      wantToBuyOnly: true,
    });
  });

  it("カテゴリを選択すると onChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterBar value={baseValue} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("カテゴリ"), "調味料");
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      category: "調味料",
    });
  });

  it("全部を選択すると、カテゴリが null になり onChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        value={{ ...baseValue, category: "調味料" }}
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText("カテゴリ"), "全部");
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      category: null,
    });
  });
});
