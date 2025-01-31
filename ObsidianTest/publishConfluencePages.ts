import * as fs from 'fs';
import * as path from 'path';
import { ConfluenceClient } from 'confluence.js';
import * as dotenv from 'dotenv';
import cron from 'node-cron';

dotenv.config({ path: path.resolve(__dirname, './.env') });

const host = process.env.CONFLUENCE_HOST ?? '';
const username = process.env.CONFLUENCE_USERNAME ?? '';
const apiToken = process.env.CONFLUENCE_API_TOKEN ?? '';
const spaceKey = process.env.CONFLUENCE_SPACE_KEY ?? '';

const confluence = new ConfluenceClient({
    host: host,
    authentication: {
        basic: {
            username: username,
            password: apiToken
        }
    }
});

const docsFolder = path.join(__dirname, 'docs');

async function createProjectFolder(projectName: string) {
    try {
        const existingPage = await confluence.content.getContent({
            spaceKey: spaceKey,
            title: projectName,
            expand: ['version']
        });

        if (existingPage.results.length > 0) {
            return existingPage.results[0].id;
        } else {
            const newPage = await confluence.content.createContent({
                title: projectName,
                type: 'page',
                space: {
                    key: spaceKey
                },
                body: {
                    storage: {
                        value: `<h1>${projectName}</h1>`,
                        representation: 'storage'
                    }
                }
            });
            return newPage.id;
        }
    } catch (error) {
        console.error(`Failed to create or find project folder ${projectName}:`, error);
        throw error;
    }
}

async function publishDocs() {
    const projectName = path.basename(path.resolve(__dirname, '..'));
    const projectFolderId = await createProjectFolder(projectName);
    const files = fs.readdirSync(docsFolder);

    for (const file of files) {
        const filePath = path.join(docsFolder, file);
        const stat = fs.statSync(filePath);

        if (stat.isFile() && path.extname(file) === '.md') { // Ensure only .md files are processed
            const content = fs.readFileSync(filePath, 'utf-8');
            const title = path.basename(file, path.extname(file));

            try {
                const existingPage = await confluence.content.getContent({
                    spaceKey: spaceKey,
                    title: title,
                    expand: ['version']
                });

                if (existingPage.results.length > 0) {
                    const pageId = existingPage.results[0].id;
                    await confluence.content.updateContent({
                        id: pageId,
                        title: title,
                        body: {
                            storage: {
                                value: content,
                                representation: 'wiki'
                            }
                        },
                        type: 'page',
                        version: {
                            number: existingPage.results[0].version?.number ? existingPage.results[0].version.number + 1 : 1
                        },
                        ancestors: [{ id: projectFolderId }]
                    });
                } else {
                    await confluence.content.createContent({
                        title: title,
                        type: 'page',
                        space: {
                            key: spaceKey
                        },
                        body: {
                            storage: {
                                value: content,
                                representation: 'wiki'
                            }
                        },
                        ancestors: [{ id: projectFolderId }]
                    });
                }
                console.log(`Published ${title} to Confluence`);
            } catch (error) {
                console.error(`Failed to publish ${title}:`, error);
            }
        }
    }
}

publishDocs().catch(console.error);

// Schedule the script to run every Sunday at midnight
// cron.schedule('0 0 * * 0', publishDocs).catch(console.error);