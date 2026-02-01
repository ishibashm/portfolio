"use client";

import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormNewsletter } from "./form-newsletter";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowRightIcon, Cross1Icon } from "@radix-ui/react-icons";
import { inputVariants } from "@/components/ui/input";
import { useIsV0 } from "../_lib/context";

const DURATION = 0.3;
const DELAY = DURATION;
const EASE_OUT = "easeOut";
const EASE_OUT_OPACITY = [0.25, 0.46, 0.45, 0.94] as const;
const SPRING = {
  type: "spring" as const,
  stiffness: 60,
  damping: 10,
  mass: 0.8,
};

export const Newsletter = () => {
  const [isOpen, setIsOpen] = useState(false);

  const isInitialRender = useRef(true);

  useEffect(() => {
    return () => {
      isInitialRender.current = false;
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="flex overflow-hidden relative flex-col gap-4 justify-center items-center pt-10 w-full h-full short:lg:pt-10 pb-footer-safe-area 2xl:pt-footer-safe-area px-sides short:lg:gap-4 lg:gap-8">
      <motion.div
        layout="position"
        transition={{ duration: DURATION, ease: EASE_OUT }}
      >
        <h1 className="font-serif text-5xl italic short:lg:text-8xl sm:text-8xl lg:text-9xl text-foreground">
          Synecdoche®
        </h1>
      </motion.div>

      <div className="flex flex-col items-center min-h-0 shrink">
        <AnimatePresenceGuard>
          {!isOpen && (
            <motion.div
              key="newsletter"
              initial={isInitialRender.current ? false : "hidden"}
              animate="visible"
              exit="exit"
              variants={{
                visible: {
                  scale: 1,
                  transition: {
                    delay: DELAY,
                    duration: DURATION,
                    ease: EASE_OUT,
                  },
                },
                hidden: {
                  scale: 0.9,
                  transition: { duration: DURATION, ease: EASE_OUT },
                },
                exit: {
                  y: -150,
                  scale: 0.9,
                  transition: { duration: DURATION, ease: EASE_OUT },
                },
              }}
            >
              <div className="flex flex-col gap-4 w-full max-w-xl md:gap-6 lg:gap-8">
                <FormNewsletter
                  input={(props) => (
                    /* @ts-expect-error - Type mismatch */
                    <motion.input
                      autoCapitalize="off"
                      autoComplete="email"
                      placeholder="Enter your email"
                      className={inputVariants()}
                      initial={isInitialRender.current ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: DURATION,
                          ease: EASE_OUT_OPACITY,
                        },
                      }}
                      transition={{
                        duration: DURATION,
                        ease: EASE_OUT,
                        delay: DELAY,
                      }}
                      {...props}
                    />
                  )}
                  submit={(props) => (
                    /* @ts-expect-error - Type mismatch */
                    <motion.button
                      className={buttonVariants({
                        variant: "iconButton",
                        size: "icon-xl",
                      })}
                      {...props}
                      initial={isInitialRender.current ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: DURATION,
                          ease: EASE_OUT_OPACITY,
                        },
                      }}
                      transition={{
                        duration: DURATION,
                        ease: EASE_OUT,
                        delay: DELAY,
                      }}
                    >
                      <ArrowRightIcon className="w-4 h-4 text-current" />
                    </motion.button>
                  )}
                />
                <motion.p
                  initial={isInitialRender.current ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{
                    opacity: 0,
                    transition: { duration: DURATION, ease: EASE_OUT_OPACITY },
                  }}
                  transition={{
                    duration: DURATION,
                    ease: EASE_OUT,
                    delay: DELAY,
                  }}
                  className="text-base short:lg:text-lg sm:text-lg lg:text-xl leading-[1.1]! font-medium text-center text-foreground text-pretty"
                >
                  最新のニュースや限定コンテンツをお届けします！
                  今すぐニュースレターに登録して、エキサイティングな更新情報をお見逃しなく。
                </motion.p>
              </div>
            </motion.div>
          )}

          <motion.div
            layout="position"
            transition={SPRING}
            key="button"
            className={isOpen ? "my-6" : "mt-6"}
          >
            <Button
              className={cn("relative px-8")}
              onClick={() => setIsOpen(!isOpen)}
              shine={!isOpen}
            >
              <motion.span
                animate={{ x: isOpen ? -16 : 0 }}
                transition={{ duration: DURATION, ease: EASE_OUT }}
                className="inline-block"
              >
                マニフェスト
              </motion.span>

              {isOpen && (
                <motion.div
                  className={cn(
                    buttonVariants({ variant: "iconButton", size: "icon" }),
                    "absolute -top-px -right-px aspect-square"
                  )}
                  initial={{ opacity: 0, scale: 0.8, rotate: -40 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{
                    duration: DURATION,
                    ease: EASE_OUT,
                    delay: DELAY,
                  }}
                >
                  <Cross1Icon className="size-5 text-primary-foreground" />
                </motion.div>
              )}
            </Button>
          </motion.div>

          {isOpen && (
            <motion.div
              key="manifesto"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={{
                visible: {
                  opacity: 1,
                  scale: 1,
                  transition: {
                    delay: DELAY,
                    duration: DURATION,
                    ease: EASE_OUT,
                  },
                },
                hidden: {
                  opacity: 0,
                  scale: 0.9,
                  transition: { duration: DURATION, ease: EASE_OUT },
                },
                exit: {
                  opacity: 0,
                  scale: 0.9,
                  transition: { duration: DURATION, ease: EASE_OUT_OPACITY },
                },
              }}
              className="relative flex min-h-0 shrink overflow-hidden text-sm md:text-base max-h-[calc(70dvh-var(--footer-safe-area))] flex-col gap-8 text-center backdrop-blur-xl text-balance border-2 border-border/50 bg-primary/20 max-w-3xl text-foreground rounded-3xl ring-1 ring-offset-primary/10 ring-border/10 ring-offset-2 shadow-button"
            >
              <article className="relative overflow-y-auto italic p-6 h-full [&_p]:my-4">
                <p>
                  「私たちは、創造性とテクノロジーが融合し、可能性を再定義する新しい時代の最前線に立っています。
                  私たちの使命は、変化を促し、進歩を推進する画期的なソリューションで、個人や企業をエンパワーすることです。」
                </p>
                <p>
                  私たちはイノベーションを信じ、単なるツールではなく、変革の触媒となる製品を生み出すために限界を押し広げます。
                  シンプルさを重視し、複雑なタスクを簡単で楽しいものにする直感的な体験をデザインします。
                </p>
                <p>
                  持続可能性へのコミットメントは、地球を守りながら卓越した価値を提供する原動力となっています。
                  私たちはコラボレーションを育み、より良い明日へのビジョンを共有する思想家、クリエイター、実行者のコミュニティを構築します。
                </p>
                <p>
                  私たちの約束は、アクセシブルで信頼性が高く、ユーザーのニーズに合わせて調整された最先端のテクノロジーを提供することです。
                  現状に挑戦し、変化を受け入れ、より明るく革新的な未来へ向けてリードします。
                </p>
                <p>
                  私たちと一緒に、世界中の隅々でイノベーションを起こし、インスピレーションを与え、創造性の火を灯す旅に参加しましょう。
                </p>
              </article>
            </motion.div>
          )}
        </AnimatePresenceGuard>
      </div>
    </div>
  );
};

const AnimatePresenceGuard = ({ children }: { children: React.ReactNode }) => {
  const isV0 = useIsV0();

  return isV0 ? <>{children}</> : <AnimatePresence mode="popLayout" propagate>{children}</AnimatePresence>;
};
