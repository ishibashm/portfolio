/// <reference types="next/image-types/global" />

/**
 * 画像を import できることを、**リポジトリに載る形で**型に教える。
 *
 * ## なぜ要るか
 *
 * `leafletDefaultIcon.ts` で leaflet 同梱の PNG を import したところ、
 * 手元では通るのに CI だけ落ちた。
 *
 *   src/lib/leafletDefaultIcon.ts(2,24): error TS2307:
 *   Cannot find module 'leaflet/dist/images/marker-icon.png'
 *
 * 画像を import できるという宣言は `next-env.d.ts` の
 * `/// <reference types="next/image-types/global" />` が持っている。
 * ところがこのファイルは **.gitignore に入っていて（45 行目）、
 * `next dev` / `next build` が走ったときに作られる**。
 *
 * 手元では `npm run build` を回したあとだったので存在していた。CI は
 * `npx prisma generate` → `npx tsc --noEmit` の順で、**build を通らない**。
 * だから CI にだけ宣言が無かった。
 *
 * ## ここでやっていること
 *
 * 同じ参照を、git に載るファイルからも張るだけ。宣言を書き写しては
 * いないので、next 側が形を変えても付いていく（`declare module "*.png"`
 * を自分で書くと、next 側の宣言と二重定義になる）。
 */
export {};
