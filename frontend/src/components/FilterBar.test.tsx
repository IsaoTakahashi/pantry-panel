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
    render(
      <FilterBar
        value={baseValue}
        onChange={onChange}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );

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
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "クリア" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      searchText: "",
    });
  });

  it("検索テキストが空のときクリアボタンは表示されない", () => {
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "クリア" }),
    ).not.toBeInTheDocument();
  });

  it("カテゴリを選択すると onChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        value={baseValue}
        onChange={onChange}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );

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
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("カテゴリ"), "全部");
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      category: null,
    });
  });
});

describe("FilterBar 🛒 wantToBuy トグル", () => {
  it("aria-label='買いたいものだけ' のボタンが存在する", () => {
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "買いたいものだけ" }),
    ).toBeInTheDocument();
  });

  it("wantToBuyOnly=false のとき aria-pressed='false'", () => {
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "買いたいものだけ" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("wantToBuyOnly=true のとき aria-pressed='true'", () => {
    render(
      <FilterBar
        value={{ ...baseValue, wantToBuyOnly: true }}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "買いたいものだけ" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("OFF→クリックで onChange に wantToBuyOnly=true が渡る", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        value={baseValue}
        onChange={onChange}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "買いたいものだけ" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      wantToBuyOnly: true,
    });
  });

  it("ON→クリックで onChange に wantToBuyOnly=false が渡る", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        value={{ ...baseValue, wantToBuyOnly: true }}
        onChange={onChange}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "買いたいものだけ" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      wantToBuyOnly: false,
    });
  });
});

describe("FilterBar 表示モードトグル", () => {
  it("role='switch' と aria-label='表示モード' を持つボタンが存在する", () => {
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("switch", { name: "表示モード" }),
    ).toBeInTheDocument();
  });

  it("「通常」「シンプル」両方のラベルが視覚的に表示される", () => {
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("通常")).toBeInTheDocument();
    expect(screen.getByText("シンプル")).toBeInTheDocument();
  });

  it("viewMode='normal' のとき aria-checked='false'", () => {
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("switch", { name: "表示モード" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("viewMode='simple' のとき aria-checked='true'", () => {
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="simple"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("switch", { name: "表示モード" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("normal でクリックすると onViewModeChange('simple') が呼ばれる", async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={onViewModeChange}
      />,
    );
    await user.click(screen.getByRole("switch", { name: "表示モード" }));
    expect(onViewModeChange).toHaveBeenCalledWith("simple");
  });

  it("simple でクリックすると onViewModeChange('normal') が呼ばれる", async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="simple"
        onViewModeChange={onViewModeChange}
      />,
    );
    await user.click(screen.getByRole("switch", { name: "表示モード" }));
    expect(onViewModeChange).toHaveBeenCalledWith("normal");
  });
});
