// 每一條：標題，加上段落（body）和／或條列（items）。
export type LegalSection = { title: string; body?: string[]; items?: string[] };

type LegalDocumentProps = {
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
  contactLabel: string;
  contactEmail: string;
};

// 隱私權政策、服務條款共用的版面：標題、更新日期、前言、編號條文、聯絡信箱。
// 這兩頁在 (app) 之外（不用登入就能看），所以自己帶 <main> 與寬度，和 (app) 的外框一致。
export function LegalDocument({
  title,
  updatedAt,
  intro,
  sections,
  contactLabel,
  contactEmail,
}: LegalDocumentProps) {
  return (
    <main className='mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 pb-8'>
      <header className='flex flex-col gap-1'>
        <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
        <p className='text-sm text-muted-foreground'>{updatedAt}</p>
      </header>

      <p className='leading-relaxed'>{intro}</p>

      <ol className='flex flex-col gap-6'>
        {sections.map((section, index) => (
          <li key={section.title} className='flex flex-col gap-2'>
            <h2 className='text-lg font-semibold'>
              {index + 1}. {section.title}
            </h2>
            {section.body?.map((paragraph) => (
              <p key={paragraph} className='leading-relaxed text-muted-foreground'>
                {paragraph}
              </p>
            ))}
            {section.items && (
              <ul className='flex list-disc flex-col gap-1.5 pl-5 leading-relaxed text-muted-foreground marker:text-primary'>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <p className='text-sm'>
        {contactLabel}
        <a
          href={`mailto:${contactEmail}`}
          className='font-medium text-primary underline-offset-4 hover:underline'
        >
          {contactEmail}
        </a>
      </p>
    </main>
  );
}
