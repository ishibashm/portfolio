import React from "react";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import SharePageClient from "./SharePageClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const component = await prisma.visualizedComponent.findUnique({
    where: { id },
  });

  if (!component) {
    return {
      title: "Wave Not Found | Resonance Sandbox",
    };
  }

  return {
    title: `${component.title} | Resonance Sandbox`,
    description: `Check out this custom resonance waveform configuration: ${component.title} simulated in the Resonance Sandbox.`,
  };
}

export default async function SharePage({ params }: PageProps) {
  const { id } = await params;
  const component = await prisma.visualizedComponent.findUnique({
    where: { id },
  });

  if (!component) {
    notFound();
  }

  // Cast JSON type to avoid TypeScript issues when passing to client component
  const serializedComponent = {
    id: component.id,
    title: component.title,
    style: component.style,
    inputData:
      typeof component.inputData === "string"
        ? JSON.parse(component.inputData)
        : component.inputData,
    cleanHtml: component.cleanHtml,
    createdAt: component.createdAt.toISOString(),
  };

  return <SharePageClient component={serializedComponent} />;
}
