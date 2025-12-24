# (Testing Server)

## ⚙️ Installation & Setup

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd testing-server
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env` file in the root directory and add the following:

   ```env
   PORT=5000
   GEMINI_API_KEY=your_gemini_api_key
   DB_USER=your_mongodb_username
   DB_PASS=your_mongodb_password
   ```

4. **Run the server**:
   - For development (with nodemon):
     ```bash
     npm run dev
     ```
   - For production:
     ```bash
     npm start
     ```
