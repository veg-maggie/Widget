(() => {
  "use strict";

  const c = window.VERIFICATION_CONFIG || {};

  const $ = (id) => document.getElementById(id);

  const contactScreen = $("contact-screen");
  const otpScreen = $("otp-screen");
  const verifiedScreen = $("verified-screen");

  const identifier = $("identifier");
  const otp = $("otp");

  const sendBtn = $("send-btn");
  const verifyBtn = $("verify-btn");
  const resendBtn = $("resend-current");
  const timer = $("resend-timer");

  const changeBtn = $("change-contact");
  const contactError = $("contact-error");
  const otpError = $("otp-error");
  const otpStatus = $("otp-status");
  const otpDescription = $("otp-description");

  const methodEl = $("verification-method");
  const contactEl = $("verified-contact");

  const truecallerBtn = $("truecaller-btn");

  const CHANNELS = {
    "11": {
      name: "SMS OTP"
    },
    "12": {
      name: "WhatsApp OTP"
    },
    "4": {
      name: "Voice"
    },
    "3": {
      name: "Email OTP"
    }
  };

  let currentChannel = c.defaultChannel || "11";
  let currentIdentifier = "";
  let reqId = null;
  let countdown = 0;
  let timerId = null;
  let verified = false;

  /*
   * ---------------------------------------------------------
   * Utility functions
   * ---------------------------------------------------------
   */

  function setError(element, message) {
    element.hidden = !message;
    element.textContent = message || "";
  }

  function setStatus(message) {
    otpStatus.hidden = !message;
    otpStatus.textContent = message || "";
  }

  function normalizeIdentifier(value) {
    return String(value || "").trim();
  }

  function isValidIdentifier(value) {
    const v = normalizeIdentifier(value);

    // Email
    if (v.includes("@")) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    // Mobile number
    const digits = v.replace(/\D/g, "");

    return digits.length >= 8 && digits.length <= 15;
  }

  function displayContact(value) {
    const v = String(value || "");

    if (!c.maskContact) {
      return v;
    }

    // Email masking
    if (v.includes("@")) {
      const parts = v.split("@");
      const local = parts[0];
      const domain = parts[1];

      return `${local.slice(0, 2)}***@${domain}`;
    }

    // Mobile masking
    const digits = v.replace(/\D/g, "");

    if (digits.length >= 8) {
      return `${v.slice(0, Math.max(0, v.length - 6))}******${v.slice(-2)}`;
    }

    return v;
  }

  function setButtons(disabled) {
    sendBtn.disabled = disabled;
    verifyBtn.disabled = disabled;
    resendBtn.disabled = disabled;

    document
      .querySelectorAll(".channel-btn")
      .forEach((button) => {
        button.disabled = disabled;
      });

    if (truecallerBtn) {
      truecallerBtn.disabled = disabled;
    }
  }

  function startTimer(seconds = 30) {
    clearInterval(timerId);

    countdown = seconds;

    resendBtn.disabled = true;
    timer.textContent = `(${countdown}s)`;

    timerId = setInterval(() => {
      countdown--;

      timer.textContent =
        countdown > 0 ? `(${countdown}s)` : "";

      if (countdown <= 0) {
        clearInterval(timerId);
        resendBtn.disabled = false;
      }
    }, 1000);
  }

  /*
   * ---------------------------------------------------------
   * Screen handling
   * ---------------------------------------------------------
   */

  function showOtp() {
    contactScreen.hidden = true;
    otpScreen.hidden = false;

    otp.focus();
  }

  function showContact() {
    otpScreen.hidden = true;
    contactScreen.hidden = false;

    setError(contactError, "");

    identifier.focus();
  }

  function showVerified(data) {
    verified = true;

    otpScreen.hidden = true;
    verifiedScreen.hidden = false;

    const channel = CHANNELS[currentChannel];

    methodEl.textContent = channel
      ? channel.name
      : "Truecaller";

    contactEl.textContent = displayContact(
      data?.phone ||
      data?.mobile ||
      data?.email ||
      currentIdentifier
    );

    document.title = "Verified";
  }

  /*
   * ---------------------------------------------------------
   * Normal OTP flow
   * ---------------------------------------------------------
   */

  function sendOtp() {
    setError(contactError, "");

    const value = normalizeIdentifier(identifier.value);

    if (!isValidIdentifier(value)) {
      setError(
        contactError,
        "Enter a valid mobile number with country code or a valid email address."
      );

      return;
    }

    if (typeof window.sendOtp !== "function") {
      setError(
        contactError,
        "MSG91 custom OTP methods are not available."
      );

      return;
    }

    currentIdentifier = value;

    sendBtn.disabled = true;

    window.sendOtp(
      currentIdentifier,

      (data) => {
        console.log("OTP sent:", data);

        setStatus(
          `OTP sent via ${
            CHANNELS[currentChannel]?.name || "OTP"
          }.`
        );

        otpDescription.textContent =
          `Enter the OTP sent to ${displayContact(
            currentIdentifier
          )}.`;

        showOtp();

        startTimer(30);

        sendBtn.disabled = false;
      },

      (error) => {
        console.error("Send OTP failed:", error);

        sendBtn.disabled = false;

        setError(
          contactError,
          error?.message ||
            "Unable to send OTP. Try another channel."
        );
      }
    );
  }

  function verifyOtp() {
    setError(otpError, "");
    setStatus("");

    const value = otp.value.trim();

    if (!/^\d{4,10}$/.test(value)) {
      setError(
        otpError,
        "Enter the OTP you received."
      );

      return;
    }

    if (typeof window.verifyOtp !== "function") {
      setError(
        otpError,
        "MSG91 verification method is not available."
      );

      return;
    }

    verifyBtn.disabled = true;

    window.verifyOtp(
      value,

      (data) => {
        verifyBtn.disabled = false;

        console.log("OTP verification success:", data);

        showVerified(data);
      },

      (error) => {
        verifyBtn.disabled = false;

        console.error(
          "OTP verification failed:",
          error
        );

        setError(
          otpError,
          error?.message ||
            "Incorrect or expired OTP. You can retry or use another channel."
        );
      },

      reqId || undefined
    );
  }

  /*
   * ---------------------------------------------------------
   * Resend / fallback channels
   * ---------------------------------------------------------
   */

  function retry(channel) {
    setError(otpError, "");
    setStatus("");

    if (typeof window.retryOtp !== "function") {
      setError(
        otpError,
        "MSG91 retry method is not available."
      );

      return;
    }

    currentChannel = String(channel);

    setButtons(true);

    window.retryOtp(
      currentChannel,

      (data) => {
        console.log("OTP retry:", data);

        /*
         * Keep request ID if MSG91 provides one.
         */
        reqId =
          data?.reqId ||
          data?.req_id ||
          data?.requestId ||
          reqId;

        setButtons(false);

        setStatus(
          `OTP resent via ${
            CHANNELS[currentChannel]?.name ||
            "selected channel"
          }.`
        );

        otpDescription.textContent =
          `Enter the OTP sent to ${displayContact(
            currentIdentifier
          )}.`;

        startTimer(30);

        document
          .querySelectorAll(".channel-btn")
          .forEach((button) => {
            button.classList.toggle(
              "active",
              button.dataset.channel === currentChannel
            );
          });
      },

      (error) => {
        setButtons(false);

        console.error(
          "OTP retry failed:",
          error
        );

        setError(
          otpError,
          error?.message ||
            "This verification channel is unavailable. Try another channel."
        );
      },

      reqId || undefined
    );
  }

  /*
   * ---------------------------------------------------------
   * TRUECALLER
   * ---------------------------------------------------------
   */

  async function startTruecaller() {
    setError(otpError, "");
    setStatus("Opening Truecaller...");

    if (!c.widgetId) {
      setStatus("");

      setError(
        otpError,
        "MSG91 widget ID is not configured."
      );

      return;
    }

    if (!c.tokenAuth) {
      setStatus("");

      setError(
        otpError,
        "MSG91 widget token is not configured."
      );

      return;
    }

    try {
      if (truecallerBtn) {
        truecallerBtn.disabled = true;
      }

      const url =
        "https://control.msg91.com/api/v5/widget/getTruecallerSession" +
        "?widgetId=" +
        encodeURIComponent(c.widgetId) +
        "&isMobileSdk=1";

      console.log(
        "Requesting Truecaller session..."
      );

      const response = await fetch(url, {
        method: "GET",

        headers: {
          accept: "application/json",
          tokenauth: c.tokenAuth
        }
      });

      if (!response.ok) {
        throw new Error(
          `MSG91 returned HTTP ${response.status}`
        );
      }

      const data = await response.json();

      console.log(
        "Truecaller session response:",
        data
      );

      if (
        data.type !== "success" ||
        !data.redirection_url
      ) {
        throw new Error(
          data.message ||
            "Unable to create Truecaller session."
        );
      }

      /*
       * IMPORTANT:
       *
       * redirection_url is:
       *
       * truecallersdk://...
       *
       * This is a native Android deep link.
       *
       * Do NOT call showVerified() here.
       *
       * Launching Truecaller does NOT prove that
       * verification was successful.
       */

      console.log(
        "Launching Truecaller:",
        data.redirection_url
      );

      window.location.href =
        data.redirection_url;

    } catch (error) {
      console.error(
        "Truecaller error:",
        error
      );

      if (truecallerBtn) {
        truecallerBtn.disabled = false;
      }

      setStatus("");

      setError(
        otpError,
        error?.message ||
          "Unable to open Truecaller."
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * Initial OTP
   * ---------------------------------------------------------
   */

  function initialSend() {
    currentChannel =
      c.defaultChannel || "11";

    sendOtp();
  }

  /*
   * ---------------------------------------------------------
   * MSG91 provider loading
   * ---------------------------------------------------------
   */

  function loadProvider(urls) {
    let i = 0;

    function attempt() {
      if (i >= urls.length) {
        setError(
          contactError,
          "Unable to load the MSG91 verification service."
        );

        return;
      }

      const script =
        document.createElement("script");

      script.src = urls[i];
      script.async = true;

      script.onload = () => {
        if (
          typeof window.initSendOTP ===
          "function"
        ) {
          initialize();
        } else {
          i++;
          attempt();
        }
      };

      script.onerror = () => {
        i++;
        attempt();
      };

      document.head.appendChild(script);
    }

    attempt();
  }

  /*
   * ---------------------------------------------------------
   * MSG91 initialization
   * ---------------------------------------------------------
   */

  function initialize() {
    if (
      !c.widgetId ||
      c.widgetId === "YOUR_WIDGET_ID"
    ) {
      setError(
        contactError,
        "Configure your MSG91 widgetId in index.html."
      );

      return;
    }

    if (
      !c.tokenAuth ||
      c.tokenAuth ===
        "YOUR_CLIENT_SIDE_WIDGET_TOKEN"
    ) {
      setError(
        contactError,
        "Configure your MSG91 widget token in index.html."
      );

      return;
    }

    try {
      window.initSendOTP({
        widgetId: c.widgetId,

        tokenAuth: c.tokenAuth,

        /*
         * Required because we are using the
         * custom OTP methods.
         */
        exposeMethods: true,

        success: (data) => {
          console.log(
            "MSG91 verification success:",
            data
          );

          /*
           * Only show Verified when MSG91 actually
           * reports successful verification.
           */
          if (!verified) {
            showVerified(data);
          }
        },

        failure: (error) => {
          console.error(
            "MSG91 verification failure:",
            error
          );
        }
      });

      if (c.identifier) {
        identifier.value = c.identifier;
      }

    } catch (error) {
      console.error(error);

      setError(
        contactError,
        "Unable to initialize MSG91 verification."
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * Event listeners
   * ---------------------------------------------------------
   */

  sendBtn.addEventListener(
    "click",
    initialSend
  );

  verifyBtn.addEventListener(
    "click",
    verifyOtp
  );

  changeBtn.addEventListener(
    "click",
    showContact
  );

  resendBtn.addEventListener(
    "click",
    () => {
      retry(currentChannel);
    }
  );

  /*
   * SMS / WhatsApp / Voice / Email
   */
  document
    .querySelectorAll(
      ".channel-btn[data-channel]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          retry(button.dataset.channel);
        }
      );
    });

  /*
   * TRUECALLER
   */
  const isAndroid =
    /Android/i.test(
      navigator.userAgent
    );

  if (truecallerBtn) {
    if (!isAndroid) {
      /*
       * Truecaller native flow is intended for
       * Android, so hide it elsewhere.
       */
      truecallerBtn.hidden = true;
    } else {
      truecallerBtn.addEventListener(
        "click",
        startTruecaller
      );
    }
  }

  /*
   * Only allow numeric OTP input.
   */
  otp.addEventListener(
    "input",
    () => {
      otp.value =
        otp.value.replace(/\D/g, "");
    }
  );

  identifier.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        initialSend();
      }
    }
  );

  otp.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        verifyOtp();
      }
    }
  );

  /*
   * ---------------------------------------------------------
   * Start MSG91
   * ---------------------------------------------------------
   */

  loadProvider([
    "https://verify.msg91.com/otp-provider.js",
    "https://verify.phone91.com/otp-provider.js"
  ]);

})();
