// 住宿沒寫地址時顯示的 Google 地址（ADR 0006「地點連結」）。有當地語言時預設顯示當地語言，
// 可以切換成繁中（localAddressLanguage）。

export type AddressText = { text: string; language: string };

export type PlaceAddress = {
  primary: AddressText;
  // 切換顯示的另一種語言；沒有，或內容和 primary 相同時是 null（不顯示切換按鈕）。
  alternate: AddressText | null;
};

// 兩種語言的查詢結果配成一組，以地點 ID 對應。主要語言查不到時改用另一種，且不提供切換。
export function pairAddresses(
  placeIds: readonly string[],
  primary: { language: string; addresses: ReadonlyMap<string, string> },
  alternate: { language: string; addresses: ReadonlyMap<string, string> } | null,
): Record<string, PlaceAddress> {
  return Object.fromEntries(
    placeIds.flatMap((placeId): [string, PlaceAddress][] => {
      const main = primary.addresses.get(placeId);
      const other = alternate?.addresses.get(placeId);
      if (main === undefined) {
        return other === undefined || !alternate
          ? []
          : [
              [
                placeId,
                { primary: { text: other, language: alternate.language }, alternate: null },
              ],
            ];
      }
      return [
        [
          placeId,
          {
            primary: { text: main, language: primary.language },
            alternate:
              alternate && other !== undefined && other !== main
                ? { text: other, language: alternate.language }
                : null,
          },
        ],
      ];
    }),
  );
}
