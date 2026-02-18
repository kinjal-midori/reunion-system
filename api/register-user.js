const { google } = require('googleapis');
const { jsPDF } = require('jspdf');
const QRCode = require('qrcode');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    try {
        const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        const { 
            name, email, phone, enrollment, 
            occupation, extraInfo, year, activity, 
            foodType, paymentId, amount 
        } = data;

        // Validation
        if (!name || !email || !paymentId) {
            return res.status(400).json({ error: "Missing Mandatory Fields" });
        }
        if (occupation === 'Student' && amount < 500) {
            return res.status(400).json({ error: "Student minimum contribution is ₹500" });
        }
        if (occupation === 'Working Professional' && amount < 750) {
            return res.status(400).json({ error: "Professional minimum contribution is ₹750" });
        }

        const tokenID = `CNVRG-${Math.floor(1000 + Math.random() * 9000)}`;

        // 1. Google Sheets Connection
        const decodedCreds = Buffer.from(process.env.GOOGLE_CREDS_BASE64, 'base64').toString();
        const credentials = JSON.parse(decodedCreds);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // 2. Append Data (Columns A to O)
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.SHEET_ID,
            range: 'Registration_Reunion!A:O', 
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[
                    tokenID, name, email, phone, enrollment, 
                    occupation, extraInfo, year, activity, 
                    foodType, amount, paymentId, 
                    "PENDING_VERIFICATION", "FALSE", new Date().toLocaleString()
                ]],
            },
        });

        // 3. Generate QR & PDF
        const qrDataUrl = await QRCode.toDataURL(tokenID, { margin: 1, width: 200 });
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [100, 150] });
        
        // PDF Design
        doc.setDrawColor(200); doc.rect(5, 5, 90, 140);
        doc.setFont("helvetica", "bold"); doc.setFontSize(14);
        doc.text("CONVERGENCE 2026", 50, 20, { align: "center" });
        doc.setFontSize(10); doc.setFont("helvetica", "italic");
        doc.text("Dept. of Mathematics | DODL", 50, 26, { align: "center" });

        doc.addImage(qrDataUrl, 'PNG', 30, 35, 40, 40);

        doc.setFont("helvetica", "bold"); doc.setFontSize(16);
        doc.text(tokenID, 50, 85, { align: "center" });

        doc.setFontSize(9); doc.setFont("helvetica", "normal");
        doc.text(`NAME: ${name.toUpperCase()}`, 50, 95, { align: "center" });
        doc.text(`ENROLLMENT: ${enrollment.toUpperCase()}`, 50, 100, { align: "center" });
        doc.text(`MEAL: ${foodType.toUpperCase()}`, 50, 105, { align: "center" });
        doc.text(`AMOUNT: Rs. ${amount}`, 50, 110, { align: "center" });
        doc.text(`UTR REF: ${paymentId}`, 50, 115, { align: "center" });

        doc.setTextColor(220, 38, 38);
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.text("PROVISIONAL TOKEN", 50, 130, { align: "center" });
        doc.setFontSize(7); doc.setFont("helvetica", "normal");
        doc.text("Valid only after Admin Verification email.", 50, 135, { align: "center" });

        const pdfBase64 = doc.output('datauristring').split(',')[1];

        // 4. Send Email via Brevo
        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: "Convergence 2026", email: "kemajumder@gmail.com" }, // UPDATE THIS
                to: [{ email: email, name: name }],
                subject: `Provisional Token: ${tokenID}`,
                htmlContent: `
                    <h2>Registration Received: ${tokenID}</h2>
                    <p>Hi ${name},</p>
                    <p>We have received your details as (UTR: ${paymentId}) for <b>Rs. ${amount}</b>.</p>
                    <p>Your <b>Provisional Token</b> is attached.</p>
                    <p><i>Your registration is pending Admin Verification.</i></p>
                `,
                attachment: [{ content: pdfBase64, name: `Provisional-${tokenID}.pdf` }]
            })
        });

        return res.status(200).json({ success: true, tokenID, pdf: pdfBase64 });

    } catch (err) {
        console.error("Critical Error:", err);
        return res.status(500).json({ error: err.message });
    }
}