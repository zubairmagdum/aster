import Head from "next/head";

const T = { cream:"#F7F4EF", charcoal:"#1C1C1C", gray:"#595959", gray2:"#6B6B6B", gray3:"#808080", forest:"#2D4A3E", white:"#FFFFFF" };

export default function Privacy() {
  return (
    <div style={{minHeight:"100vh",background:T.cream,fontFamily:"'DM Sans',sans-serif",color:T.charcoal}}>
      <Head><title>Privacy Policy — Aster</title></Head>
      <div style={{maxWidth:680,margin:"0 auto",padding:"60px 24px"}}>
        <a href="/" style={{fontSize:13,color:T.forest,textDecoration:"none",display:"inline-block",marginBottom:24}}>← Back to Aster</a>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:600,color:T.charcoal,marginBottom:8}}>Privacy Policy</h1>
        <p style={{fontSize:12,color:T.gray3,marginBottom:32}}>Last updated: April 2026</p>

        <div style={{fontSize:14,color:T.gray,lineHeight:1.8}}>
          <h2 style={{fontSize:18,fontWeight:600,color:T.charcoal,marginTop:24,marginBottom:8}}>What we collect</h2>
          <p>When you use Aster, we may collect: your resume text, job descriptions you paste, your job pipeline data (companies, roles, statuses, notes), your preferences (salary target, work mode, excluded industries), and your email address if you sign in.</p>

          <h2 style={{fontSize:18,fontWeight:600,color:T.charcoal,marginTop:24,marginBottom:8}}>How we use it</h2>
          <p>Your data is used exclusively to power AI-powered job analysis, resume tailoring, outreach generation, and pipeline management within Aster. We never sell your data to third parties. Your resume and job descriptions are sent to the Anthropic Claude API for analysis — Anthropic does not use API inputs for model training.</p>

          <h2 style={{fontSize:18,fontWeight:600,color:T.charcoal,marginTop:24,marginBottom:8}}>Where your data is stored</h2>
          <p>If you use Aster without signing in, all data is stored in your browser's localStorage only — it never leaves your device. If you sign in, your data is stored in Supabase (hosted in the United States) and synchronized across your devices. Your Anthropic API key is stored server-side and never exposed to the client.</p>

          <h2 style={{fontSize:18,fontWeight:600,color:T.charcoal,marginTop:24,marginBottom:8}}>Your rights</h2>
          <p>You can delete all your data at any time by clicking "Delete my workspace" in the app footer. This clears your localStorage immediately. If you are signed in, you can request deletion of your server-side data by contacting us. You can also export your pipeline data as CSV at any time from the Pipeline tab.</p>

          <h2 style={{fontSize:18,fontWeight:600,color:T.charcoal,marginTop:24,marginBottom:8}}>Cookies and tracking</h2>
          <p>Aster does not use third-party cookies, analytics services, or tracking pixels. We use localStorage for session persistence and Supabase Auth for authentication. No data is shared with advertisers.</p>

          <h2 style={{fontSize:18,fontWeight:600,color:T.charcoal,marginTop:24,marginBottom:8}}>Contact</h2>
          <p>If you have questions about this privacy policy or your data, contact us at <a href="mailto:zubair@astercopilot.com" style={{color:T.forest}}>zubair@astercopilot.com</a>.</p>
        </div>

        <div style={{marginTop:48,paddingTop:24,borderTop:`1px solid #E2DDD4`,textAlign:"center"}}>
          <p style={{fontSize:11,color:T.gray3}}>✦ Aster — Your career, in bloom.</p>
        </div>
      </div>
    </div>
  );
}
