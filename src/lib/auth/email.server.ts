/** Credentials stay on the server; verification tokens are never logged. */
export async function deliverAuthEmail(to:string,subject:string,url:string) {
  const key=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;
  if(!key||!from)throw new Error('Account email is temporarily unavailable. Please try again shortly.');
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:[to],subject,text:`Oklahoma Prospects\n\n${subject}:\n${url}\n\nIf you did not request this, you can ignore this email.`}),
    signal:AbortSignal.timeout(10000),
  });
  if(!response.ok)throw new Error('Email could not be delivered. Please try again.');
}
