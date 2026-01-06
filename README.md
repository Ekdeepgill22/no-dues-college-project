# College Document Request System

A web-based document request management system for colleges, allowing students to submit document requests with digital signatures and enabling administrators to review, approve, and communicate with students.

## Project Overview

This is a **Node.js backend application** using **Express.js** that serves a static HTML frontend. The system manages:

- Student document requests (Bonafide Certificate, Fee Receipt, Character Certificate)
- Digital signature uploads
- Admin approval workflow
- Real-time chat between students and admins
- Certificate generation for approved requests

## Technology Stack

- **Backend**: Node.js with Express.js v5.1.0
- **File Upload**: Multer v2.0.2
- **CORS**: Enabled for cross-origin requests
- **Storage**: In-memory (data resets on server restart)

## Prerequisites

- **Node.js**: Version 14.x or higher (ES modules support required)
- **npm**: Comes with Node.js

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration** (Optional)
   - The server runs on port `5000` by default
   - To change the port, set the `PORT` environment variable:
     ```bash
     # Windows PowerShell
     $env:PORT=3000; npm start
     
     # Linux/Mac
     PORT=3000 npm start
     ```

3. **Start the Server**
   ```bash
   npm start
   ```

   The server will start at `http://localhost:5000`

## Project Structure

```
college-docs/
├── server.js          # Main Express server (entry point)
├── package.json       # Dependencies and scripts
├── public/            # Static frontend files
│   ├── index.html     # Student request form
│   ├── admin.html     # Admin dashboard
│   ├── chat.html      # Chat interface
│   ├── certificate.html # Certificate display
│   ├── style.css      # Shared styles
│   └── pic.jpg        # College logo
└── uploads/           # Uploaded signature files (auto-created)
```

## API Endpoints

### Student Endpoints
- `POST /submit` - Submit a document request with signature
  - Body: `multipart/form-data` with `name`, `roll`, `docType`, `signature` (file)
  - Returns: Request object with unique ID

### Admin Endpoints
- `GET /requests` - Fetch all document requests
- `PATCH /approve/:id` - Approve a request by ID

### Chat Endpoints
- `GET /chat/:id` - Get chat messages for a request
- `POST /chat/:id` - Send a chat message
  - Body: `{ "sender": "admin" | "student", "message": "..." }`

### Utility
- `GET /health` - Health check endpoint

## Usage

### For Students

1. Navigate to `http://localhost:5000`
2. Fill out the document request form:
   - Enter your name
   - Enter your roll number
   - Select document type
   - Upload your digital signature (image file)
3. Click "Submit"
4. You'll receive a link to chat with the admin

### For Administrators

1. Navigate to `http://localhost:5000/admin.html`
2. View all pending and approved requests
3. Click "Approve" to approve a pending request
4. Click "Chat" to communicate with students
5. Click "Generate Certificate" for approved requests

## Verification

To verify the application is working:

1. **Health Check**
   ```bash
   curl http://localhost:5000/health
   ```
   Should return: `{"status":"ok","timestamp":"..."}`

2. **Test Submission**
   - Open `http://localhost:5000` in a browser
   - Submit a test request with a signature image
   - Verify the request appears in the admin dashboard

3. **Test Chat**
   - Open the chat link from a submitted request
   - Send a test message
   - Verify messages appear in real-time (updates every 2 seconds)

## Known Limitations

1. **In-Memory Storage**: All data (requests and chats) is stored in memory and will be lost when the server restarts. For production use, consider integrating a database (MongoDB, PostgreSQL, etc.).

2. **No Authentication**: The system currently has no user authentication. Anyone can access the admin dashboard. For production, add authentication middleware.

3. **File Storage**: Uploaded files are stored on the filesystem without cleanup. Consider implementing file cleanup policies for production.

4. **No Validation**: Limited input validation. Consider adding more robust validation for production use.

5. **Single Server**: The chat polling mechanism (2-second intervals) may not scale well. Consider WebSockets for real-time communication in production.

## Development

### Scripts

- `npm start` - Start the production server
- `npm test` - Placeholder test script (not implemented)

### Making Changes

- The server automatically creates the `uploads/` directory if it doesn't exist
- Changes to server code require a restart
- Frontend files are served statically - refresh the browser to see changes

## Troubleshooting

**Port Already in Use**
- Change the PORT environment variable or stop the process using port 5000

**File Upload Fails**
- Ensure the `uploads/` directory exists and is writable
- Check file size limits (Multer default is unlimited)

**Requests Not Persisting**
- This is expected behavior - data is stored in memory and resets on server restart

## License

ISC

