function firstName(name = '') {
    return name.trim().split(/\s+/)[0] || '';
}

function oneLine(value = '') {
    return value.replace(/\s+/g, ' ').trim();
}

function buildSubject(reason = '', name = '') {
    const cleanReason = oneLine(reason);
    if (!cleanReason) return name ? `Quick question for ${firstName(name)}` : 'Quick question';
    const compact = cleanReason.length > 56 ? `${cleanReason.slice(0, 53).trim()}...` : cleanReason;
    return compact[0] === compact[0]?.toUpperCase() ? compact : compact.charAt(0).toUpperCase() + compact.slice(1);
}

function draftOutreach({ name = '', reason = '', website = '', contacts = {}, context = {} } = {}) {
    const recipient = firstName(name);
    const greeting = recipient ? `Hi ${recipient},` : 'Hello,';
    const cleanReason = oneLine(reason) || 'connect and learn whether there is a good fit to talk further';
    const siteLine = website ? `I came across your information through ${website}.` : 'I came across your publicly listed contact information.';
    const orgLine = context.title ? `I noticed ${context.title}.` : '';
    const bestEmail = contacts.primaryEmail || contacts.emails?.[0] || '';

    const email = [
        `Subject: ${buildSubject(reason, name)}`,
        '',
        greeting,
        '',
        `${siteLine} ${orgLine}`.trim(),
        '',
        `I am reaching out because I would like to ${cleanReason}. If you are the right person to speak with, I would appreciate the chance to connect. If someone else is better suited, would you be open to pointing me in the right direction?`,
        '',
        'Thank you,',
        '[Your Name]'
    ].filter(line => line !== undefined).join('\n');

    const message = [
        greeting,
        `${siteLine} I would like to ${cleanReason}. Would you be open to a quick conversation or able to point me to the best person to contact?`,
        'Thank you!'
    ].join('\n\n');

    return {
        email,
        message,
        suggestedRecipient: bestEmail
    };
}

module.exports = {
    buildSubject,
    draftOutreach,
    firstName
};
