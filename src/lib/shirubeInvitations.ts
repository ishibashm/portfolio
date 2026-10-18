/** Only these public fixed IDs may start a conversation from a URL. */
export const SHIRUBE_INVITATIONS = [
  {
    id: "move",
    label: "引越しを考えている",
    question: "引越しを考えています。日付と方位を相談したいです。",
    calculationHref: "/relocation/arbitrage",
  },
  {
    id: "days",
    label: "吉日を知りたい",
    question: "引越しの吉日を知りたいです。",
    calculationHref: "/relocation/timing",
  },
  {
    id: "star",
    label: "本命星を知りたい",
    question: "私の本命星を知りたいです。",
    calculationHref: "/houi",
  },
  {
    id: "towns",
    label: "いまの街から方位ごとの街を探す",
    question: "いま住んでいる街から、方位ごとの街を知りたいです。",
    calculationHref: "/houi/area",
  },
] as const;
export function shirubeInvitation(id: string | null) {
  return SHIRUBE_INVITATIONS.find((item) => item.id === id);
}
