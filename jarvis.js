#!/usr/bin/env node

const { discoverContacts } = require('./jarvis/agent');

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) continue;
        const key = arg.slice(2);
        const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
        args[key] = value;
    }
    return args;
}

function printUsage() {
    console.log(`Jarvis contact agent

Usage:
  npm run jarvis -- --website example.com --name "Jane Doe" --reason "invite them to speak at our event"
  npm run jarvis -- --name "Jane Doe" --reason "ask about partnership opportunities"

Jarvis only reads public pages and drafts outreach from the reason you provide.`);
}

async function run() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || (!args.website && !args.name)) {
        printUsage();
        process.exit(args.help ? 0 : 1);
    }

    const result = await discoverContacts({
        name: args.name || '',
        website: args.website || '',
        reason: args.reason || ''
    });

    console.log(JSON.stringify(result, null, 2));
}

run().catch(error => {
    console.error(`Jarvis failed: ${error.message}`);
    process.exit(1);
});
