const CONTACT_PATH_HINTS = [
    'contact',
    'about',
    'team',
    'staff',
    'people',
    'directory',
    'leadership',
    'faculty',
    'support'
];

const SOCIAL_HOSTS = [
    'linkedin.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'facebook.com',
    'tiktok.com',
    'youtube.com'
];

function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
}

function stripHtml(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&#64;/g, '@')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeHtml(value) {
    return value
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}

function normalizeWebsite(input) {
    if (!input || !input.trim()) return '';
    const value = input.trim();
    if (/^https?:\/\//i.test(value)) return value;
    return `https://${value}`;
}

function safeUrl(input, baseUrl) {
    try {
        return new URL(decodeHtml(input), baseUrl).toString();
    } catch {
        return '';
    }
}

function sameOrigin(url, originUrl) {
    try {
        return new URL(url).origin === new URL(originUrl).origin;
    } catch {
        return false;
    }
}

function extractTitle(html) {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? stripHtml(match[1]).slice(0, 140) : '';
}

function extractMetaDescription(html) {
    const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i);
    return match ? decodeHtml(match[1]).trim().slice(0, 260) : '';
}

function extractEmails(html) {
    const mailtoMatches = Array.from(html.matchAll(/href=["']mailto:([^"'?]+)[^"']*["']/gi))
        .map(match => decodeURIComponent(decodeHtml(match[1])).trim().toLowerCase());
    const text = stripHtml(html)
        .replace(/\s*\[\s*at\s*\]\s*/gi, '@')
        .replace(/\s*\(\s*at\s*\)\s*/gi, '@')
        .replace(/\s+at\s+/gi, '@')
        .replace(/\s*\[\s*dot\s*\]\s*/gi, '.')
        .replace(/\s*\(\s*dot\s*\)\s*/gi, '.')
        .replace(/\s+dot\s+/gi, '.');
    const textMatches = Array.from(text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi))
        .map(match => match[0].toLowerCase())
        .filter(email => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(email));
    return unique([...mailtoMatches, ...textMatches]);
}

function extractPhones(html) {
    const telMatches = Array.from(html.matchAll(/href=["']tel:([^"']+)["']/gi))
        .map(match => decodeHtml(match[1]).replace(/[^\d+]/g, ''));
    const text = stripHtml(html);
    const textMatches = Array.from(text.matchAll(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?:\s*(?:x|ext\.?)\s*\d{1,6})?/gi))
        .map(match => match[0].replace(/\s+/g, ' ').trim());
    return unique([...telMatches, ...textMatches]);
}

function extractLinks(html, baseUrl) {
    const links = [];
    for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = safeUrl(match[1], baseUrl);
        if (!href) continue;
        links.push({
            url: href,
            text: stripHtml(match[2]).slice(0, 120)
        });
    }
    return links;
}

function extractSocialLinks(links) {
    return unique(links
        .map(link => link.url)
        .filter(url => {
            try {
                const host = new URL(url).hostname.replace(/^www\./, '');
                return SOCIAL_HOSTS.some(socialHost => host === socialHost || host.endsWith(`.${socialHost}`));
            } catch {
                return false;
            }
        }));
}

function extractContactCandidateLinks(links, baseUrl) {
    return unique(links
        .filter(link => sameOrigin(link.url, baseUrl))
        .filter(link => {
            const haystack = `${link.url} ${link.text}`.toLowerCase();
            return CONTACT_PATH_HINTS.some(hint => haystack.includes(hint));
        })
        .map(link => link.url.split('#')[0]));
}

function scoreEmail(email, personName = '') {
    const localPart = email.split('@')[0].toLowerCase();
    const nameParts = personName.toLowerCase().split(/\s+/).filter(part => part.length > 1);
    let score = 0;

    for (const part of nameParts) {
        if (localPart.includes(part)) score += 25;
    }
    if (/^(info|hello|contact|support|admin|office|team|media|press|sales)$/.test(localPart)) {
        score -= 10;
    }
    if (/^(no-?reply|donotreply)/.test(localPart)) {
        score -= 100;
    }

    return score;
}

function rankEmails(emails, personName = '') {
    return [...emails].sort((a, b) => scoreEmail(b, personName) - scoreEmail(a, personName) || a.localeCompare(b));
}

function extractPageContactInfo(html, pageUrl, personName = '') {
    const links = extractLinks(html, pageUrl);
    const emails = rankEmails(extractEmails(html), personName);
    const phones = extractPhones(html);
    const socialLinks = extractSocialLinks(links);
    const contactLinks = extractContactCandidateLinks(links, pageUrl);

    return {
        pageUrl,
        title: extractTitle(html),
        description: extractMetaDescription(html),
        emails,
        phones,
        socialLinks,
        contactLinks
    };
}

function mergePageResults(pages, personName = '') {
    const emails = rankEmails(unique(pages.flatMap(page => page.emails)), personName);
    const phones = unique(pages.flatMap(page => page.phones));
    const socialLinks = unique(pages.flatMap(page => page.socialLinks));
    const contactPages = unique(pages
        .flatMap(page => [page.pageUrl, ...page.contactLinks])
        .filter(url => {
            const lower = url.toLowerCase();
            return CONTACT_PATH_HINTS.some(hint => lower.includes(hint));
        }));

    return {
        primaryEmail: emails[0] || '',
        emails,
        phones,
        socialLinks,
        contactPages
    };
}

module.exports = {
    CONTACT_PATH_HINTS,
    SOCIAL_HOSTS,
    extractContactCandidateLinks,
    extractEmails,
    extractLinks,
    extractPageContactInfo,
    extractPhones,
    extractSocialLinks,
    mergePageResults,
    normalizeWebsite,
    rankEmails,
    sameOrigin,
    safeUrl,
    scoreEmail,
    stripHtml,
    unique
};
