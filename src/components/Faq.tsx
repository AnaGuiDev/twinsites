import { useEffect } from "react";
import { useI18n } from "../i18n";

/**
 * Plain answers to what people ask, limits included. Native details/summary,
 * so it opens with a keyboard and works without JavaScript styling tricks.
 */
export function Faq({ page = false }: { page?: boolean }) {
  const { t } = useI18n();

  useEffect(() => {
    if (!page) return;
    const previous = document.title;
    document.title = `${t.faqPageTitle} — Twinsites`;
    return () => {
      document.title = previous;
    };
  }, [page, t.faqPageTitle]);

  const Heading = page ? "h1" : "h2";
  return (
    <section className={page ? "faq faq-page" : "faq"} id="faq" aria-labelledby="faq-title">
      <Heading id="faq-title">{page ? t.faqPageTitle : t.faqTitle}</Heading>
      <div className="faq-list">
        {t.faq.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
