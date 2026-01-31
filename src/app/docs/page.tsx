import fs from 'fs';
import path from 'path';
import { remark } from 'remark';
import html from 'remark-html';
import Link from 'next/link';

async function getReadmeContent() {
  const readmePath = path.join(process.cwd(), 'README.md');
  const fileContents = fs.readFileSync(readmePath, 'utf8');

  const processedContent = await remark()
    .use(html)
    .process(fileContents);

  return processedContent.toString();
}

export default async function DocsPage() {
  const content = await getReadmeContent();

  return (
    <div className="min-h-screen bg-black text-white p-8 pt-24">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
            <Link href="/" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                ← Back to Home
            </Link>
        </div>
        
        <article 
            className="prose prose-invert prose-lg max-w-none prose-headings:text-indigo-300 prose-a:text-indigo-400 prose-pre:bg-gray-900 prose-pre:border prose-pre:border-white/10"
            dangerouslySetInnerHTML={{ __html: content }} 
        />
      </div>
    </div>
  );
}
