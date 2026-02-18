const { google } = require('googleapis');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    const { tokenID } = req.body;

    try {
        const decodedCreds = Buffer.from(process.env.GOOGLE_CREDS_BASE64, 'base64').toString();
        const credentials = JSON.parse(decodedCreds);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.SHEET_ID;

        // 1. Get All Data
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Registration_Reunion!A:O',
        });

        const rows = response.data.values;
        // Find row by Token ID (Column A, Index 0)
        const rowIndex = rows.findIndex(row => row[0] === tokenID);
        const row = rows[rowIndex];

        if (!row) return res.status(404).json({ valid: false, error: "INVALID TOKEN" });

        const name = row[1];       // Name
        const foodType = row[9];   // Food Choice (Column J)
        const status = row[12];    // Status (Column M)
        const redeemed = row[13];  // Redeemed (Column N)

        // 2. Logic Checks
        if (status !== 'VERIFIED') {
            return res.status(200).json({ valid: false, error: "PAYMENT PENDING / REJECTED" });
        }

        if (redeemed === 'TRUE') {
            return res.status(200).json({ valid: false, error: "ALREADY REDEEMED (USED)" });
        }

        // 3. Mark as Redeemed (Strike off)
        const range = `Registration_Reunion!N${rowIndex + 1}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [['TRUE']] }
        });

        // 4. Return Success
        return res.status(200).json({ 
            valid: true, 
            name, 
            foodType 
        });

    } catch (error) {
        return res.status(500).json({ valid: false, error: "SERVER ERROR" });
    }
}