import { expect, test } from "@playwright/test";

test.describe("商品管理", () => {
  test("商品を登録して削除できる", async ({ page }) => {
    const itemName = `醤油-${Date.now()}`;

    await page.goto("/stock-items");

    // 商品登録
    await page.getByRole("button", { name: "商品を追加" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("名前").fill(itemName);
    await dialog.getByLabel("カテゴリ", { exact: true }).selectOption("調味料");
    await dialog.getByRole("button", { name: "追加", exact: true }).click();

    // 登録した商品が表示されていることを確認
    await expect(page.getByText(itemName)).toBeVisible();

    // 商品を削除
    await page
      .getByRole("article", { name: itemName })
      .getByRole("button", { name: "削除" })
      .click();
    // ConfirmDialog opens — click the confirm button
    await page.getByRole("button", { name: "確認" }).click();
    // Wait for exit animation to finish
    await expect(page.getByRole("dialog")).not.toBeAttached();

    // 商品が削除されていることを確認
    await expect(page.getByText(itemName)).not.toBeVisible();
  });

  // Scenario: D-1
  test("商品の名前を編集できる", async ({ page }) => {
    const itemName = `テスト商品-${Date.now()}`;
    const newItemName = `編集済み商品-${Date.now()}`;

    await page.goto("/stock-items");

    // 商品登録
    await page.getByRole("button", { name: "商品を追加" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel("名前").fill(itemName);
    await createDialog
      .getByLabel("カテゴリ", { exact: true })
      .selectOption("調味料");
    await createDialog
      .getByRole("button", { name: "追加", exact: true })
      .click();

    // 登録した商品が表示されていることを確認
    await expect(page.getByText(itemName)).toBeVisible();
    // Wait for modal exit animation to finish before opening EditItemModal
    await expect(page.getByRole("dialog")).not.toBeAttached();

    // 編集ボタン（カテゴリ+名前テキストを含むボタン）をクリック
    await page
      .getByRole("article", { name: itemName })
      .getByRole("button", { name: new RegExp(itemName) })
      .click();

    // EditItemModal で名前を変更して保存
    const editDialog = page.getByRole("dialog");
    await editDialog.getByLabel("名前").fill(newItemName);
    await editDialog.getByRole("button", { name: "保存" }).click();

    // 新しい名前が表示されていることを確認
    await expect(page.getByText(newItemName)).toBeVisible();

    // クリーンアップ: 商品を削除
    await page
      .getByRole("article", { name: newItemName })
      .getByRole("button", { name: "削除" })
      .click();
    // ConfirmDialog opens — click the confirm button
    await page.getByRole("button", { name: "確認" }).click();
    await expect(page.getByRole("dialog")).not.toBeAttached();

    await expect(page.getByText(newItemName)).not.toBeVisible();
  });

  // Scenario: D-2
  test("商品のカテゴリを編集できる", async ({ page }) => {
    const itemName = `カテゴリ変更テスト-${Date.now()}`;
    const initialCategory = "調味料";
    const newCategory = "飲み物";

    await page.goto("/stock-items");

    // 商品登録
    await page.getByRole("button", { name: "商品を追加" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel("名前").fill(itemName);
    await createDialog
      .getByLabel("カテゴリ", { exact: true })
      .selectOption(initialCategory);
    await createDialog
      .getByRole("button", { name: "追加", exact: true })
      .click();

    // 登録した商品が表示されていることを確認
    await expect(page.getByText(itemName)).toBeVisible();
    // Wait for modal exit animation to finish before opening EditItemModal
    await expect(page.getByRole("dialog")).not.toBeAttached();

    // 編集ボタンをクリック
    await page
      .getByRole("article", { name: itemName })
      .getByRole("button", { name: new RegExp(itemName) })
      .click();

    // EditItemModal でカテゴリを変更して保存
    const editDialog = page.getByRole("dialog");
    await editDialog.getByLabel("カテゴリ").selectOption(newCategory);
    await editDialog.getByRole("button", { name: "保存" }).click();

    // 新しいカテゴリバッジが表示されていることを確認
    await expect(
      page
        .getByRole("article", { name: itemName })
        .getByText(newCategory, { exact: true }),
    ).toBeVisible();

    // クリーンアップ: 商品を削除
    await page
      .getByRole("article", { name: itemName })
      .getByRole("button", { name: "削除" })
      .click();
    // ConfirmDialog opens — click the confirm button
    await page.getByRole("button", { name: "確認" }).click();
    await expect(page.getByRole("dialog")).not.toBeAttached();

    await expect(page.getByText(itemName)).not.toBeVisible();
  });

  // Scenario: K-4
  test("ログアウトボタンを押すとログインページに遷移する", async ({ page }) => {
    await page.goto("/stock-items");

    // サインアウトボタンをクリック
    await page.getByRole("button", { name: "サインアウト" }).click();

    // ログインページに遷移することを確認
    await expect(page).toHaveURL(/\/login/);
  });
});
