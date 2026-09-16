function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function stripMarkup(value = '') {
  return decodeXml(String(value)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tagValue(block, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
    if (match) return stripMarkup(match[1]);
  }
  return '';
}

function rawTagValue(block, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
    if (match) return decodeXml(match[1]).trim();
  }
  return '';
}

function linkValue(block) {
  const alternate = block.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i)
    || block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  if (alternate) return decodeXml(alternate[1]).trim();
  return tagValue(block, ['link']) || tagValue(block, ['guid', 'id']);
}

function imageValue(block) {
  const decoded = decodeXml(block);
  const patterns = [
    /<media:content\b[^>]*\burl=["']([^"']+)["'][^>]*>/i,
    /<media:thumbnail\b[^>]*\burl=["']([^"']+)["'][^>]*>/i,
    /<enclosure\b(?=[^>]*\btype=["']image\/[^"']+["'])[^>]*\burl=["']([^"']+)["'][^>]*>/i,
    /<enclosure\b(?=[^>]*\burl=["']([^"']+)["'])[^>]*\btype=["']image\/[^"']+["'][^>]*>/i,
    /<link\b(?=[^>]*\brel=["']enclosure["'])(?=[^>]*\btype=["']image\/[^"']+["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/i,
    /<image\b[^>]*>[\s\S]*?<url\b[^>]*>([^<]+)<\/url>/i,
    /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match?.[1]) return decodeXml(match[1]).trim();
  }
  return '';
}

export function parseFeedXml(xml) {
  const text = String(xml || '');
  const rssItems = [...text.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const atomEntries = rssItems.length ? [] : [...text.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  const blocks = rssItems.length ? rssItems : atomEntries;
  return {
    items: blocks.map((block) => ({
      title: tagValue(block, ['title']),
      link: linkValue(block),
      guid: tagValue(block, ['guid', 'id']),
      image: imageValue(block),
      contentSnippet: tagValue(block, ['description', 'summary']),
      contentEncoded: rawTagValue(block, ['content:encoded']),
      content: rawTagValue(block, ['content']),
      summary: tagValue(block, ['summary']),
      description: tagValue(block, ['description']),
      creator: tagValue(block, ['dc:creator', 'creator', 'author', 'name']),
      dcCreator: tagValue(block, ['dc:creator']),
      author: tagValue(block, ['author', 'name']),
      isoDate: tagValue(block, ['dc:date']),
      pubDate: tagValue(block, ['pubDate']),
      published: tagValue(block, ['published']),
      updated: tagValue(block, ['updated'])
    }))
  };
}
