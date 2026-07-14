import { extname } from 'node:path';
import { parseDocx } from './parsers/docx.js';
import { parsePlainText } from './parsers/markdown.js';

export async function loadInputText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.docx') return parseDocx(filePath);
  if (ext === '.md' || ext === '.markdown' || ext === '.txt') return parsePlainText(filePath);
  throw new Error(`Unsupported input file extension "${ext}" for "${filePath}". Supported: .md, .markdown, .txt, .docx`);
}
