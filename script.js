(()=>{"use strict";
const c=window.VERIFICATION_CONFIG||{};
const $=id=>document.getElementById(id);

const contactScreen=$("contact-screen");
const otpScreen=$("otp-screen");
const verifiedScreen=$("verified-screen");
const identifier=$("identifier");
const otp=$("otp");
const sendBtn=$("send-btn");
const verifyBtn=$("verify-btn");
const resendBtn=$("resend-current");
const timer=$("resend-timer");
const changeBtn=$("change-contact");
const contactError=$("contact-error");
const otpError=$("otp-error");
const otpStatus=$("otp-status");
const otpDescription=$("otp-description");

const methodEl=$("verification-method");
const contactEl=$("verified-contact");

const CHANNELS={
  "11":{name:"SMS OTP"},
  "12":{name:"WhatsApp OTP"},
  "4":{name:"Voice"},
  "3":{name:"Email OTP"}
};

let currentChannel=c.defaultChannel||"11";
let currentIdentifier="";
let reqId=null;
let countdown=0;
let timerId=null;
let verified=false;

function setError(el,msg){
  el.hidden=!msg;
  el.textContent=msg||"";
}

function setStatus(msg){
  otpStatus.hidden=!msg;
  otpStatus.textContent=msg||"";
}

function normalizeIdentifier(value){
  return String(value||"").trim();
}

function isValidIdentifier(value){
  const v=normalizeIdentifier(value);
  if(v.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const digits=v.replace(/\D/g,"");
  return digits.length>=8 && digits.length<=15;
}

function displayContact(value){
  const v=String(value||"");
  if(!c.maskContact) return v;
  if(v.includes("@")){
    const [local,domain]=v.split("@");
    return `${local.slice(0,2)}***@${domain}`;
  }
  const digits=v.replace(/\D/g,"");
  if(digits.length>=8) return `${v.slice(0,Math.max(0,v.length-6))}******${v.slice(-2)}`;
  return v;
}

function setButtons(disabled){
  sendBtn.disabled=disabled;
  verifyBtn.disabled=disabled;
  resendBtn.disabled=disabled;
  document.querySelectorAll(".channel-btn").forEach(b=>b.disabled=disabled);
}

function startTimer(seconds=30){
  clearInterval(timerId);
  countdown=seconds;
  resendBtn.disabled=true;
  timer.textContent=`(${countdown}s)`;
  timerId=setInterval(()=>{
    countdown--;
    timer.textContent=countdown>0?`(${countdown}s)`:"";
    if(countdown<=0){
      clearInterval(timerId);
      resendBtn.disabled=false;
    }
  },1000);
}

function showOtp(){
  contactScreen.hidden=true;
  otpScreen.hidden=false;
  otp.focus();
}

function showContact(){
  otpScreen.hidden=true;
  contactScreen.hidden=false;
  setError(contactError,"");
  identifier.focus();
}

function showVerified(data){
  verified=true;
  otpScreen.hidden=true;
  verifiedScreen.hidden=false;

  const channel=CHANNELS[currentChannel];
  methodEl.textContent=channel?channel.name:"OTP";
  contactEl.textContent=displayContact(
    data?.phone || data?.mobile || data?.email || currentIdentifier
  );

  document.title="Verified";
}

function sendOtp(){
  setError(contactError,"");
  const value=normalizeIdentifier(identifier.value);

  if(!isValidIdentifier(value)){
    setError(contactError,"Enter a valid mobile number with country code or a valid email address.");
    return;
  }

  if(typeof window.sendOtp!=="function"){
    setError(contactError,"MSG91 custom OTP methods are not available.");
    return;
  }

  currentIdentifier=value;
  sendBtn.disabled=true;

  window.sendOtp(
    currentIdentifier,
    data=>{
      console.log("OTP sent:",data);
      setStatus(`OTP sent via ${CHANNELS[currentChannel]?.name||"OTP"}.`);
      otpDescription.textContent=`Enter the OTP sent to ${displayContact(currentIdentifier)}.`;
      showOtp();
      startTimer(30);
      sendBtn.disabled=false;
    },
    error=>{
      console.error("Send OTP failed:",error);
      sendBtn.disabled=false;
      setError(contactError,error?.message||"Unable to send OTP. Try another channel.");
    }
  );
}

function verifyOtp(){
  setError(otpError,"");
  setStatus("");

  const value=otp.value.trim();

  if(!/^\d{4,10}$/.test(value)){
    setError(otpError,"Enter the OTP you received.");
    return;
  }

  if(typeof window.verifyOtp!=="function"){
    setError(otpError,"MSG91 verification method is not available.");
    return;
  }

  verifyBtn.disabled=true;

  window.verifyOtp(
    value,
    data=>{
      verifyBtn.disabled=false;
      showVerified(data);
    },
    error=>{
      verifyBtn.disabled=false;
      console.error("OTP verification failed:",error);
      setError(otpError,error?.message||"Incorrect or expired OTP. You can retry or use another channel.");
    },
    reqId || undefined
  );
}

function retry(channel){
  setError(otpError,"");
  setStatus("");

  if(typeof window.retryOtp!=="function"){
    setError(otpError,"MSG91 retry method is not available.");
    return;
  }

  currentChannel=String(channel);
  setButtons(true);

  window.retryOtp(
    currentChannel,
    data=>{
      console.log("OTP retry:",data);

      /*
       * MSG91 returns retry data. Keep the request id if it is
       * supplied by the widget implementation.
       */
      reqId=data?.reqId || data?.req_id || data?.requestId || reqId;

      setButtons(false);
      setStatus(`OTP resent via ${CHANNELS[currentChannel]?.name||"selected channel"}.`);
      otpDescription.textContent=`Enter the OTP sent to ${displayContact(currentIdentifier)}.`;
      startTimer(30);

      document.querySelectorAll(".channel-btn").forEach(b=>{
        b.classList.toggle("active",b.dataset.channel===currentChannel);
      });
    },
    error=>{
      setButtons(false);
      console.error("OTP retry failed:",error);
      setError(otpError,error?.message||"This verification channel is unavailable. Try another channel.");
    },
    reqId || undefined
  );
}

function initialSend(){
  currentChannel=c.defaultChannel||"11";
  sendOtp();
}

function loadProvider(urls){
  let i=0;

  function attempt(){
    if(i>=urls.length){
      setError(contactError,"Unable to load the MSG91 verification service.");
      return;
    }

    const script=document.createElement("script");
    script.src=urls[i];
    script.async=true;

    script.onload=()=>{
      if(typeof window.initSendOTP==="function"){
        initialize();
      }else{
        i++;
        attempt();
      }
    };

    script.onerror=()=>{
      i++;
      attempt();
    };

    document.head.appendChild(script);
  }

  attempt();
}

function initialize(){
  if(!c.widgetId||c.widgetId==="YOUR_WIDGET_ID"){
    setError(contactError,"Configure your MSG91 widgetId in index.html.");
    return;
  }

  if(!c.tokenAuth||c.tokenAuth==="YOUR_CLIENT_SIDE_WIDGET_TOKEN"){
    setError(contactError,"Configure your MSG91 widget token in index.html.");
    return;
  }

  try{
    window.initSendOTP({
      widgetId:c.widgetId,
      tokenAuth:c.tokenAuth,
      identifier:c.identifier||undefined,
      exposeMethods:true,

      success:data=>{
        /*
         * This is the authoritative client-side success event.
         * Never use a URL parameter/localStorage value as proof of
         * verification.
         */
        console.log("MSG91 success:",data);
        if(!verified) showVerified(data);
      },

      failure:error=>{
        console.error("MSG91 failure:",error);
      }
    });

    if(c.identifier){
      identifier.value=c.identifier;
    }
  }catch(e){
    console.error(e);
    setError(contactError,"Unable to initialize MSG91 verification.");
  }
}

sendBtn.addEventListener("click",initialSend);
verifyBtn.addEventListener("click",verifyOtp);
changeBtn.addEventListener("click",showContact);

resendBtn.addEventListener("click",()=>{
  retry(currentChannel);
});

document.querySelectorAll(".channel-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    /*
     * Selecting another channel is an explicit fallback action.
     * A wrong OTP does NOT silently switch channels.
     */
    retry(btn.dataset.channel);
  });
});

otp.addEventListener("input",()=>{
  otp.value=otp.value.replace(/\D/g,"");
});

identifier.addEventListener("keydown",e=>{
  if(e.key==="Enter") initialSend();
});

otp.addEventListener("keydown",e=>{
  if(e.key==="Enter") verifyOtp();
});

loadProvider([
  "https://verify.msg91.com/otp-provider.js",
  "https://verify.phone91.com/otp-provider.js"
]);
})();