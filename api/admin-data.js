const { google } = require('googleapis');

export default async function handler(req, res) {
    const decodedCreds = Buffer.from(process.env.GOOGLE_CREDS_BASE64, 'base64').toString();
    const credentials = JSON.parse(decodedCreds);
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHEET_ID;

    // --- GET METHOD: FETCH PENDING LIST ---
    if (req.method === 'GET') {
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'Registration_Reunion!A:O', 
            });

            const rows = response.data.values;
            if (!rows || rows.length === 0) return res.status(200).json([]);

            const pendingUsers = rows
                .filter(row => row[12] === 'PENDING_VERIFICATION')
                .map(row => ({
                    tokenID: row[0],
                    name: row[1],
                    email: row[2],
                    occupation: row[5],
                    amount: row[10], 
                    paymentId: row[11] 
                }));

            return res.status(200).json(pendingUsers);
        } catch (error) {
            console.error("GET Error:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    // --- POST METHOD: VERIFY (ACCEPT/REJECT) ---
    if (req.method === 'POST') {
        const { tokenID, email, name, action } = req.body;

        try {
            // 1. Fetch Columns A to I (We need Column I for "Activity")
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'Registration_Reunion!A:I', 
            });
            const rows = response.data.values;
            const rowIndex = rows.findIndex(r => r[0] === tokenID);

            if (rowIndex === -1) return res.status(404).json({ error: "Token not found" });

            // 2. Check Activity Status (Column I is index 8)
            const activityStatus = rows[rowIndex][8]; 

            let newStatus, subject, htmlContent;
            
            if (action === 'APPROVE') {
                newStatus = "VERIFIED";
                subject = "Registration Confirmed - CONVERGENCE 2026";
                
                // Base Email
                htmlContent = `
                    <div style="font-family: Arial, sans-serif; color: #333;">
                        <h2 style="color: #2563eb;">Registration Confirmed!</h2>
                        <p>Hi ${name},</p>
                        <p>Your payment has been verified. Your token <b>${tokenID}</b> is now <span style="color:green; font-weight:bold;">ACTIVE</span>.</p>
                        <p>Please show your QR code (attached previously) at the entrance.</p>
                `;

                // CONDITIONAL: Add WhatsApp Link if Activity is "Yes"
                if (activityStatus && activityStatus.trim().toLowerCase() === 'yes') {
                    htmlContent += `
                        <div style="margin-top: 20px; padding: 15px; background-color: #ecfccb; border-radius: 8px; border: 1px solid #84cc16;">
                            <h3 style="margin: 0 0 10px 0; color: #365314;">🎭 Cultural Group Invitation</h3>
                            <p style="margin: 0 0 15px 0; font-size: 14px;">Since you are participating in activities, please join our official WhatsApp group for coordination:</p>
                            <a href="https://chat.whatsapp.com/J3DStrZ95NRFcYdvOkFDUb?mode=gi_t" style="display: inline-block; padding: 10px 20px; background-color: #25D366; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Join WhatsApp Group</a>
                        </div>
                    `;
                }

                htmlContent += `</div>`; // Close main div

            } else {
                newStatus = "REJECTED";
                subject = "Registration Update - CONVERGENCE 2026";
                htmlContent = `
                    <h2>Registration Update</h2>
                    <p>Hi ${name},</p>
                    <p>There was a T&C issue faced according to your transaction details.</p>
                    <p>Please contact the helpline number: <b>7439063833</b>.</p>
                `;
            }

            // 3. Update Status in Sheet (Column M is index 12 -> row is rowIndex + 1)
            const range = `Registration_Reunion!M${rowIndex + 1}`;
            
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[newStatus]] }
            });

            // 4. Send Email via Brevo
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': process.env.BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: "Convergence Admin", email: "kemajumder@gmail.com" }, // Ensure this email is verified in Brevo
                    to: [{ email, name }],
                    subject,
                    htmlContent
                })
            });

            return res.status(200).json({ success: true });

        } catch (error) {
            console.error("POST Error:", error);
            return res.status(500).json({ error: error.message });
        }
    }
}