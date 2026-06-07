const {
    extractPageContactInfo,
    mergePageResults,
    normalizeWebsite,
    safeUrl,
    sameOrigin,
    unique
} = require('./extract');
const { draftOutreach } = require('./draft');

const DEFAULT_MAX_PAGES = 5;
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_USER_AGENT = 'JarvisContactAgent/1.0 (+https://github.com/)';

function withTimeout(timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return { controller, timeout };
}

async function fetchText(url, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const { controller, timeout } = withTimeout(timeoutMs);
    try {
        const response = await fetchImpl(url, {
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'user-agent': DEFAULT_USER_AGENT,
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const contentType = response.headers?.get?.('content-type') || '';
        if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
            throw new Error(`Unsupported content type: ${contentType}`);
        }

        return {
            finalUrl: response.url || url,
            html: await response.text()
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchWebsiteWithFallback(inputUrl, options) {
    const primary = normalizeWebsite(inputUrl);
    try {
        return await fetchText(primary, options);
    } catch (error) {
        if (primary.startsWith('https://')) {
            const insecureUrl = `http://${primary.slice('https://'.length)}`;
            try {
                return await fetchText(insecureUrl, options);
            } catch {
                throw error;
            }
        }
        throw error;
    }
}

function decodeDuckDuckGoUrl(url) {
    try {
        const parsed = new URL(url);
        const uddg = parsed.searchParams.get('uddg');
        return uddg ? decodeURIComponent(uddg) : url;
    } catch {
        return url;
    }
}

function extractSearchResultUrls(html) {
    const urls = [];
    for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
        const raw = match[1];
        const resolved = safeUrl(raw, 'https://duckduckgo.com/');
        if (!resolved) continue;
        const decoded = decodeDuckDuckGoUrl(resolved);
        try {
            const parsed = new URL(decoded);
            const host = parsed.hostname.replace(/^www\./, '');
            if (host.includes('duckduckgo.com') || host.includes('google.com') || host.includes('bing.com')) continue;
            if (!/^https?:$/i.test(parsed.protocol)) continue;
            urls.push(parsed.toString());
        } catch {
            // Ignore malformed search result links.
        }
    }
    return unique(urls);
}

async function resolveWebsiteFromName(name, options = {}) {
    if (!name || !name.trim()) return '';
    const query = encodeURIComponent(`${name.trim()} official website contact`);
    const searchUrl = `https://duckduckgo.com/html/?q=${query}`;
    const { html } = await fetchText(searchUrl, options);
    return extractSearchResultUrls(html)[0] || '';
}

function buildContext(pages) {
    const firstPage = pages.find(page => page.title || page.description) || {};
    return {
        title: firstPage.title || '',
        description: firstPage.description || ''
    };
}

async function discoverContacts(input = {}, options = {}) {
    const fetchOptions = {
        fetchImpl: options.fetchImpl || fetch,
        timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS
    };
    const maxPages = options.maxPages || DEFAULT_MAX_PAGES;
    const personName = input.name || '';

    let website = input.website ? normalizeWebsite(input.website) : '';
    let resolution = null;
    if (!website && personName) {
        website = await resolveWebsiteFromName(personName, fetchOptions);
        resolution = website ? { method: 'duckduckgo', website } : null;
    }
    if (!website) {
        throw new Error('Jarvis needs a website or a name that resolves to a public website.');
    }

    const visited = new Set();
    const queue = [website];
    const pages = [];
    const errors = [];
    let canonicalWebsite = website;

    while (queue.length > 0 && pages.length < maxPages) {
        const nextUrl = queue.shift();
        if (!nextUrl || visited.has(nextUrl)) continue;
        visited.add(nextUrl);

        try {
            const { finalUrl, html } = await fetchWebsiteWithFallback(nextUrl, fetchOptions);
            canonicalWebsite = canonicalWebsite || finalUrl;
            const pageInfo = extractPageContactInfo(html, finalUrl, personName);
            pages.push(pageInfo);

            for (const link of pageInfo.contactLinks) {
                if (pages.length + queue.length >= maxPages) break;
                if (!visited.has(link) && sameOrigin(link, finalUrl)) {
                    queue.push(link);
                }
            }
        } catch (error) {
            errors.push({ url: nextUrl, message: error.message });
        }
    }

    const contacts = mergePageResults(pages, personName);
    const context = buildContext(pages);

    return {
        name: personName,
        website: canonicalWebsite,
        reason: input.reason || '',
        resolution,
        contacts,
        draft: draftOutreach({
            name: personName,
            reason: input.reason || '',
            website: canonicalWebsite,
            contacts,
            context
        }),
        sources: pages.map(page => ({
            url: page.pageUrl,
            title: page.title,
            description: page.description
        })),
        errors
    };
}

module.exports = {
    DEFAULT_MAX_PAGES,
    DEFAULT_TIMEOUT_MS,
    discoverContacts,
    extractSearchResultUrls,
    fetchText,
    resolveWebsiteFromName
};
