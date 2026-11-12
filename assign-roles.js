/**
 * Role Assignment Script
 * Assigns roles to users via Clerk Backend API
 * 
 * Usage: node assign-roles.js
 * 
 * Reads the same team role map as the server: the EMAIL_ROLE_MAP env var (JSON) or the
 * git-ignored roles.json file (see roles.example.json). Emails are deliberately not kept
 * in this file because the repository is public.
 *   DEV = Developer (can submit requests)
 *   FIN = Finance (can review & process payments)
 *   OWN = Owner/Founder (can approve requests)
 *   ADM = Admin (sees everything)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const CLERK_SECRET = process.env.CLERK_SECRET_KEY;

function loadRoleMap() {
    let raw = process.env.EMAIL_ROLE_MAP;
    const rolesFile = path.join(__dirname, 'roles.json');
    if (!raw && fs.existsSync(rolesFile)) raw = fs.readFileSync(rolesFile, 'utf8');
    if (!raw) {
        console.error('No EMAIL_ROLE_MAP env var or roles.json found. See roles.example.json.');
        process.exit(1);
    }
    const parsed = JSON.parse(raw);
    return Object.fromEntries(Object.entries(parsed).map(([email, entry]) => [email, entry.role]));
}

const ROLE_MAP = loadRoleMap();

async function assignRoles() {
    console.log('\n🔐 Clerk Role Assignment Tool\n');
    console.log('═'.repeat(50));

    for (const [email, role] of Object.entries(ROLE_MAP)) {
        process.stdout.write(`\n📧 ${email} → ${role} ... `);

        // Step 1: Find user by email
        const searchRes = await fetch(
            `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
            { headers: { 'Authorization': `Bearer ${CLERK_SECRET}` } }
        );
        const users = await searchRes.json();

        if (!Array.isArray(users) || users.length === 0) {
            console.log('⏳ NOT YET SIGNED UP (will be assigned when they register)');
            continue;
        }

        const user = users[0];
        const userId = user.id;
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';

        // Step 2: Assign role via public_metadata
        const updateRes = await fetch(
            `https://api.clerk.com/v1/users/${userId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${CLERK_SECRET}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ public_metadata: { role } }),
            }
        );

        if (updateRes.ok) {
            console.log(`✅ ASSIGNED! (${name})`);
        } else {
            const err = await updateRes.json();
            console.log(`❌ FAILED: ${JSON.stringify(err)}`);
        }
    }

    console.log('\n' + '═'.repeat(50));
    console.log('✨ Done! Users will see their new roles on next login/refresh.\n');
}

assignRoles().catch(console.error);
