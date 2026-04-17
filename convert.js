import fs from 'fs';

const logo = fs.readFileSync('./media/logo.svg');
const subtract = fs.readFileSync('./media/Subtract.svg');

const logoBase64 = logo.toString('base64');
const subtractBase64 = subtract.toString('base64');

const content = `export const LOGO_BASE64 = "data:image/svg+xml;base64,${logoBase64}";
export const SUBTRACT_BASE64 = "data:image/svg+xml;base64,${subtractBase64}";
`;

fs.writeFileSync('./src/constants.ts', content);
console.log('Successfully updated src/constants.ts');
