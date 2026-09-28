/** "Übersetzer Straße café" → "Uebersetzer Strasse cafe": keeps meaning when building ASCII slugs. */
export function transliterate(s: string): string {
  return s
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip remaining accents (é → e, ñ → n)
}
