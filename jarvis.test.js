const test = require('node:test');
const assert = require('node:assert/strict');
const {
    extractEmails,
    extractPageContactInfo,
    extractPhones,
    rankEmails
} = require('./jarvis/extract');
const { discoverContacts } = require('./jarvis/agent');
const { draftOutreach } = require('./jarvis/draft');

function response(url, html) {
    return {
        ok: true,
        status: 200,
        url,
        headers: { get: () => 'text/html; charset=utf-8' },
        text: async () => html
    };
}

test('extracts public email addresses from text and mailto links', () => {
    const html = `
        <a href="mailto:jane.doe@example.edu?subject=Hello">Email Jane</a>
        <p>Backup: info [at] example [dot] edu</p>
    `;

    assert.deepEqual(extractEmails(html), ['jane.doe@example.edu', 'info@example.edu']);
});

test('extracts phone numbers and contact candidate links from a page', () => {
    const page = extractPageContactInfo(`
        <title>Example Team</title>
        <a href="/contact">Contact us</a>
        <a href="/about/team">Team</a>
        <a href="https://linkedin.com/company/example">LinkedIn</a>
        <p>Call (404) 555-1212 ext. 9</p>
    `, 'https://example.edu/', 'Jane Doe');

    assert.deepEqual(page.phones, ['(404) 555-1212 ext. 9']);
    assert.deepEqual(page.contactLinks, ['https://example.edu/contact', 'https://example.edu/about/team']);
    assert.deepEqual(page.socialLinks, ['https://linkedin.com/company/example']);
});

test('ranks emails that match the requested person above generic inboxes', () => {
    assert.deepEqual(
        rankEmails(['info@example.edu', 'jane.doe@example.edu'], 'Jane Doe'),
        ['jane.doe@example.edu', 'info@example.edu']
    );
});

test('discovers contacts by crawling public contact pages', async () => {
    const pages = new Map([
        ['https://example.edu', `
            <title>Example Org</title>
            <meta name="description" content="A demo organization">
            <a href="/contact">Contact</a>
        `],
        ['https://example.edu/contact', `
            <h1>Contact Jane Doe</h1>
            <a href="mailto:jane.doe@example.edu">Email</a>
            <p>Phone: 404-555-1212</p>
        `]
    ]);
    const fetchImpl = async url => {
        if (!pages.has(url)) throw new Error(`Unexpected URL ${url}`);
        return response(url, pages.get(url));
    };

    const result = await discoverContacts({
        name: 'Jane Doe',
        website: 'example.edu',
        reason: 'invite her to speak at a campus event'
    }, { fetchImpl, maxPages: 3 });

    assert.equal(result.contacts.primaryEmail, 'jane.doe@example.edu');
    assert.deepEqual(result.contacts.phones, ['404-555-1212']);
    assert.equal(result.sources.length, 2);
    assert.match(result.draft.email, /invite her to speak at a campus event/);
});

test('draftOutreach creates email and short message drafts', () => {
    const draft = draftOutreach({
        name: 'Jane Doe',
        reason: 'discuss a student partnership',
        website: 'https://example.edu',
        contacts: { primaryEmail: 'jane.doe@example.edu' },
        context: { title: 'Example Org' }
    });

    assert.match(draft.email, /^Subject: Discuss a student partnership/);
    assert.match(draft.email, /Hi Jane,/);
    assert.match(draft.message, /student partnership/);
    assert.equal(draft.suggestedRecipient, 'jane.doe@example.edu');
});
