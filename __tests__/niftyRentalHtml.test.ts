import { expect, it } from "vitest";
import {
  rentalCityLinks,
  rentalPropertiesFromHtml,
} from "@/lib/niftyRentalHtml";

it("reads nested link text and decodes HTML entities", () => {
  expect(
    rentalCityLinks(
      '<a href="/rent/aichi/nagoyashinakaku_ct/"><span>名古屋市中区</span> (1,000件)</a>',
      "https://myhome.nifty.com",
    ),
  ).toEqual([
    {
      href: "https://myhome.nifty.com/rent/aichi/nagoyashinakaku_ct/",
      text: "名古屋市中区 (1,000件)",
    },
  ]);
});
it("reads inline JSON after the site's namespace initialization", () => {
  expect(
    rentalPropertiesFromHtml(
      '<script>window.Nifty = window.Nifty || {}; window.Nifty.Data = window.Nifty.Data || {}; window.Nifty.Data.Bukken = window.Nifty.Data.Bukken || {}; window.Nifty.Data.Bukken = {"a":{"id":"a","title":"A & B; }"}};</script>',
    ),
  ).toEqual([{ id: "a", title: "A & B; }" }]);
  expect(
    rentalPropertiesFromHtml("<script>window.Nifty.Data.Bukken = {};</script>"),
  ).toEqual([]);
});
it.each([
  "<html>challenge</html>",
  "<script>window.Nifty.Data.Bukken = {x: dangerous()};</script>",
  '<script>window.Nifty.Data.Bukken = {"x":null};</script>',
  '<script>window.Nifty.Data.Bukken = {"x":{"id":"x","rent":{}}};</script>',
])("rejects missing, executable or malformed data", (html) => {
  expect(rentalPropertiesFromHtml(html)).toBeNull();
});
