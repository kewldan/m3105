import { isStoredFile, previewSrc } from "@/lib/files/preview";

const WORD = /[\p{L}\p{N}]/u;

/** Первая буква или цифра слова; эмодзи, значки и «@» не считаются. */
function firstLetter(word: string): string {
  // Array.from идёт по символам, а не по половинкам суррогатной пары.
  return Array.from(word).find((ch) => WORD.test(ch)) ?? "";
}

/**
 * Инициалы для аватарки без фото: "Аня Смирнова" → "АС", "Аня" → "А".
 * Эмодзи и украшения в имени пропускаются ("🔥 Вася" → "В", "@vasya" → "V"),
 * а если букв нет вовсе — "?".
 */
export function initials(name: string): string {
  const letters = name.trim().split(/\s+/).map(firstLetter).filter(Boolean);
  const first = letters[0] ?? "";
  const last = letters.length > 1 ? letters[letters.length - 1] : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Адрес картинки для аватарки: у файла из нашего хранилища берём превью в
 * 160 пикселей (хватает на 40 px при двойной плотности), чужой адрес — как есть.
 */
export function avatarSrc(photoUrl: string): string {
  return isStoredFile(photoUrl) ? previewSrc(photoUrl, 160) : photoUrl;
}
