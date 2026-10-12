import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  DatasetJsonLd,
  DefinedTermSetJsonLd,
  FaqJsonLd,
} from "@/components/JsonLd";

// 記事やFAQの文字列はHTMLのscript終端として解釈されず、JSONへ往復できること。
const text = "説明 </script><p id=unexpected>本文ではない要素</p> < & >";
const examples = [
  [
    "Article",
    <ArticleJsonLd
      key="article"
      headline={text}
      description={text}
      path="/blog/example"
    />,
  ],
  [
    "Dataset",
    <DatasetJsonLd
      key="dataset"
      name={text}
      description={text}
      path="/houi/area/47348"
      dateModified="2026-10-11"
    />,
  ],
  [
    "BreadcrumbList",
    <BreadcrumbJsonLd key="breadcrumb" items={[{ name: text, path: "/" }]} />,
  ],
  [
    "FAQPage",
    <FaqJsonLd key="faq" items={[{ question: text, answer: text }]} />,
  ],
  [
    "DefinedTermSet",
    <DefinedTermSetJsonLd
      key="terms"
      name={text}
      description={text}
      path="/guide/glossary"
      terms={[{ name: "用語", description: text }]}
    />,
  ],
] as const;

describe("JSON-LDをHTMLとして解釈しても内容を保つ", () => {
  it.each(examples)("%s の説明がscriptを閉じない", (type, element) => {
    const html = renderToStaticMarkup(element);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    expect(doc.querySelector("#unexpected")).toBeNull();
    const data = JSON.parse(scripts[0].textContent!);
    expect(data["@type"]).toBe(type);
    expect(JSON.stringify(data)).toContain(text);
  });
});
