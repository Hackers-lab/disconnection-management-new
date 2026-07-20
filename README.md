# Disconnection Management Web App

A Next.js web application for managing consumer disconnection data with real-time sync from Google Sheets.

## Features

- 📊 **Dashboard** with real-time statistics
- 👥 **User Management** with role-based access (Admin/agency)
- 🏢 **Agency-based filtering** for agencys
- 📱 **Mobile-responsive** design with tab navigation
- 🔍 **Advanced filtering** and sorting capabilities
- 📈 **OSD (Outstanding Dues) sorting** - High to Low, Low to High
- 🔄 **Real-time sync** from Google Sheets
- 📝 **Consumer data management** with status updates
- 🖼️ **Image upload** support (with Vercel Blob)
- 🔐 **Secure authentication** with JWT sessions

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   \`\`\`bash
   git clone <your-repo-url>
   cd disconnection-management-app
   \`\`\`

2. **Install dependencies**
   \`\`\`bash
   npm install
   \`\`\`

3. **Set up environment variables**
   \`\`\`bash
   cp .env.local.example .env.local
   \`\`\`
   Edit `.env.local` and add your `SESSION_SECRET`:
   \`\`\`
   SESSION_SECRET=your-super-secret-key-change-this-in-production
   \`\`\`

4. **Run the development server**
   \`\`\`bash
   npm run dev
   \`\`\`

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Default Login Credentials

### Admin User
- **Username:** `admin`
- **Password:** `admin123`
- **Access:** Full system access, user management

### Agency agencys
- **JOY GURU:** `joyguru_user1` / `pass123`
- **ST:** `st_user1` / `pass123`
- **MATIUR:** `matiur_user1` / `pass123`
- **AMS:** `ams_user1` / `pass123`
- **SAMAD:** `samad_user1` / `pass123`
- **CHANCHAL:** `chanchal_user1` / `pass123`
- **ALOKE CHAKRABORTY:** `aloke_user1` / `pass123`
- **SA:** `sa_user1` / `pass123`
- **APOLLO:** `apollo_user1` / `pass123`
- **ROXY:** `roxy_user1` / `pass123`
- **MALDA:** `malda_user1` / `pass123`
- **SUPREME:** `supreme_user1` / `pass123`
- **LAIBAH:** `laibah_user1` / `pass123`
- **MATIN:** `matin_user1` / `pass123`
- **MUKTI:** `mukti_user1` / `pass123`

## Mobile Features

### Tab Navigation
- **Dashboard Tab:** Shows statistics and key metrics
- **Consumers Tab:** Shows consumer tiles with filters
- **Responsive Design:** Adapts to mobile and desktop screens

### OSD Sorting
- Click the sort button to cycle through:
  - **None:** Default order
  - **High to Low:** Highest outstanding dues first  
  - **Low to High:** Lowest outstanding dues first

## Data Source

The app fetches consumer data from a public Google Sheets CSV export. The data includes:
- Consumer details (ID, name, address)
- Outstanding dues (OSD) information
- Disconnection status and dates
- Agency assignments
- Geographic coordinates

## File Structure

\`\`\`
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard page
│   ├── login/            # Login page
│   └── actions/          # Server actions
├── components/           # React components
│   ├── ui/              # shadcn/ui components
│   └── ...              # Custom components
├── lib/                 # Utility libraries
├── data/                # User data storage
└── public/              # Static assets
\`\`\`

## Development

### Adding New Users
1. Login as admin
2. Click the admin icon in the header
3. Go to "Manage Users" tab
4. Add new users with appropriate roles and agencies

### Customizing Agencies
Edit the `AGENCIES` array in `lib/google-sheets.ts` to add/remove agencies.

### Environment Variables
- `SESSION_SECRET`: Required for JWT token signing
- `BLOB_READ_WRITE_TOKEN`: Optional, for image uploads
- `GOOGLE_APPS_SCRIPT_URL`: Optional, for write-back to Google Sheets

## Deployment

### Vercel (Recommended)
1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

### Other Platforms
The app can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

## Troubleshooting

### User Data Not Persisting
- Check if `data/` directory exists
- Verify file permissions
- Check server logs for storage errors

### Google Sheets Not Loading
- Verify the CSV URL is accessible
- Check network connectivity
- Review console logs for fetch errors

### Authentication Issues
- Ensure `SESSION_SECRET` is set
- Clear browser cookies/localStorage
- Check if users.json file exists

## Support

For issues and questions, please check the console logs and verify your environment setup.
\`\`\`

```plaintext file=".env.local.example"
# Copy this file to .env.local and fill in your values

# Required: Session secret for JWT tokens (use a long, random string)
SESSION_SECRET=your-super-secret-key-change-this-in-production

# Optional: Vercel Blob token for image upload functionality
# Get this from: https://vercel.com/dashboard/stores
# BLOB_READ_WRITE_TOKEN=your-vercel-blob-token

# Optional: Google Apps Script URL for syncing data back to Google Sheets
# GOOGLE_APPS_SCRIPT_URL=your-google-apps-script-deployment-url
