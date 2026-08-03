import { Resend } from 'resend';

/**
 * Adres, na który idą powiadomienia dla administratora instancji (nowa rejestracja, feedback).
 *
 * ŚWIADOMIE bez wartości domyślnej. Wcześniej był tu zaszyty konkretny adres, co oznaczało,
 * że KAŻDA postawiona instancja wysyłałaby powiadomienia — wraz z nazwą i e-mailem swojego
 * użytkownika — do właściciela oryginalnego kodu. Brak zmiennej = powiadomienia się nie wysyłają;
 * weryfikacja e-maila, reset hasła i zaproszenia działają niezależnie od niej.
 */
const adminNotificationEmail = () => process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || null;

/**
 * Adres kontaktowy pokazywany użytkownikom w treści maili i ustawiany jako `reply_to`.
 *
 * ŚWIADOMIE bez wartości domyślnej — z tego samego powodu co `adminNotificationEmail`
 * wyżej. Zaszyty adres oznaczałby, że maile z KAŻDEJ postawionej instancji odsyłają
 * użytkowników do autora kodu. Brak zmiennej = maile wychodzą bez `reply_to`,
 * a zdanie z adresem kontaktowym po prostu się nie pojawia.
 */
const contactEmail = () => process.env.REPLY_TO_EMAIL?.trim() || null;

/**
 * Nadawca maili. Domena MUSI być zweryfikowana w Resendzie — inaczej wysyłka odpada
 * po stronie dostawcy. Wartość domyślna jest celowo nieistniejąca (`example.com`):
 * ma paść czytelnie na Twojej konfiguracji, a nie po cichu podszywać się pod cudzą domenę.
 */
const senderEmail = () => process.env.RESEND_FROM_EMAIL?.trim() || 'SmartPortfel <no-reply@example.com>';

// Pomocnicza funkcja realizująca Exponential Backoff dla żądań sieciowych
const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`[Email Retry] Ostateczna porażka po ${maxRetries} próbach.`);
        throw error;
      }
      // Exponential backoff: 1s, 2s, 4s...
      const delayMs = initialDelay * Math.pow(2, attempt - 1);
      console.warn(`[Email Retry] Próba ${attempt} nieudana, ponawiam za ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Unreachable");
};

export const sendVerificationEmail = async (email: string, token: string) => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error('RESEND_API_KEY is not defined in environment variables. Verification email not sent.');
    return;
  }

  const resend = new Resend(apiKey);
  const nUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const verificationLink = `${nUrl}/verify-email?token=${token}`;

  try {
    const fromEmail = senderEmail();
    // Świadomie BEZ adresu odbiorcy w logu. To aplikacja do finansów osobistych —
    // sam fakt „ten e-mail ma tu konto" jest daną osobową, a logi bywają zbierane
    // i przechowywane dłużej niż ktokolwiek zakłada.
    console.log('[Email] Wysyłam wiadomość weryfikacyjną.');

    const response = await withRetry(() => resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Zweryfikuj swój adres e-mail',
      ...(contactEmail() ? { reply_to: contactEmail()! } : {}),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1eb3ab;">Cześć!</h2>
          
          <p>Bardzo się cieszymy, że jesteś w gronie BETA-testerów naszej aplikacji! To dla nas ogromne wsparcie.</p>
          
          <p><strong>Co teraz?</strong><br>
          Aplikacja ma kilka modułów i funkcji, zachęcam do wypróbowania wszystkich, w szczególności:</p>

          <ul style="padding-left: 20px; line-height: 1.6;">
            <li>Dodanie kont osobistych (każda płatność będzie aktualizować stan Twoich kont),</li>
            <li>Import historycznych danych (na początek spróbuj probkę danych, np. z ostatniego miesiąca),</li>
            <li>Zweryfikuj czy system dobrze rozpoznał kategorie,</li>
            <li>Jeśli posiadasz jakieś oszczędności lub inwestycje przetestuj, czy moduły są dla Ciebie intuicyjne,</li>
            <li>Regularnie wprowadzaj wpływy i wydatki,</li>
            <li>Zweryfikuj czy wśród sklepów i kategorii jest wszystko czego potrzebujesz.</li>
          </ul>

          <p>Widzisz błąd? Brakuje Ci jakiejś funkcji? Po prostu odpisz na tego maila${contactEmail() ? ` lub daj znać na <a href="mailto:${contactEmail()}" style="color: #1eb3ab;">${contactEmail()}</a>` : ''}.</p>

          <p>Aby móc się zalogować, potwierdź swój adres e-mail, klikając w poniższy przycisk:</p>
          
          <div style="margin: 30px 0;">
            <a href="${verificationLink}" 
               style="background-color: #1eb3ab; color: white; padding: 12px 24px; text-decoration: none; rounded: 5px; font-weight: bold; border-radius: 5px; display: inline-block;">
               Zweryfikuj e-mail
            </a>
          </div>
          
          <p>Dziękuję, że pomagasz nam budować najlepszy tracker finansowy w Polsce!</p>
          
          <p>Pozdrawiamy,<br>
          Zespół SmartPortfel</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #666; font-size: 14px;">Jeśli przycisk nie działa, skopiuj i wklej poniższy link do przeglądarki:</p>
          <p style="color: #666; font-size: 14px;">${verificationLink}</p>
        </div>
      `,
    }));

    if (response.error) {
      console.error('Resend API error:', response.error);
      throw new Error(`Resend error: ${JSON.stringify(response.error)}`);
    }

    console.log('Resend success:', response.data);
    return response.data;
  } catch (err: any) {
    console.error('Detailed error sending email:', {
      message: err?.message,
      name: err?.name,
      stack: err?.stack,
      ...(err?.response && { responseData: err.response.data })
    });
    throw err;
  }
};

export const sendFeedbackEmail = async (userEmail: string, username: string, message: string) => {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = adminNotificationEmail();

  if (!toEmail) {
    console.log('[Email] ADMIN_NOTIFICATION_EMAIL nie ustawiony — feedback nie zostaje wysłany.');
    return;
  }

  if (!apiKey) {
    console.error('RESEND_API_KEY is not defined. Feedback email not sent.');
    return;
  }

  const resend = new Resend(apiKey);

  try {
    const fromEmail = senderEmail();

    const response = await withRetry(() => resend.emails.send({
      from: fromEmail,
      to: toEmail,
      reply_to: userEmail,
      subject: `Nowy Feedback od: ${username}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #1eb3ab;">Nowe zgłoszenie feedbacku</h2>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; border-left: 4px solid #1eb3ab; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;"><strong>Użytkownik:</strong> ${username} (${userEmail})</p>
            <p style="margin: 0; white-space: pre-wrap;">${message}</p>
          </div>
          
          <p style="font-size: 12px; color: #999; margin-top: 30px;">
            Wiadomość wysłana automatycznie przez system SmartPortfel.
          </p>
        </div>
      `,
    }));

    if (response.error) {
      console.error('Resend Feedback API error:', response.error);
      throw new Error(`Resend error: ${JSON.stringify(response.error)}`);
    }

    return response.data;
  } catch (err: any) {
    console.error('Error sending feedback email:', err);
    throw err;
  }
};

export const sendAdminNotificationEmail = async (userEmail: string, username: string) => {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = adminNotificationEmail();

  // BLOCK EMAILS ON LOCALHOST
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Email] Skipping admin notification email (not in production)');
    return;
  }

  if (!toEmail) {
    console.log('[Email] ADMIN_NOTIFICATION_EMAIL nie ustawiony — powiadomienie o rejestracji nie zostaje wysłane.');
    return;
  }

  if (!apiKey) {
    console.error('RESEND_API_KEY is not defined. Admin notification not sent.');
    return;
  }

  const resend = new Resend(apiKey);

  try {
    const fromEmail = senderEmail();

    const response = await withRetry(() => resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `[NOWY UŻYTKOWNIK] ${username} zarejestrował się!`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #1eb3ab;">Nowa rejestracja w SmartPortfel!</h2>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; border-left: 4px solid #1eb3ab; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;"><strong>Szczegóły użytkownika:</strong></p>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Nazwa:</strong> ${username}</li>
              <li><strong>Email:</strong> ${userEmail}</li>
              <li><strong>Data:</strong> ${new Date().toLocaleString('pl-PL')}</li>
            </ul>
          </div>
          
          <p style="font-size: 12px; color: #999; margin-top: 30px;">
            Wiadomość wysłana automatycznie przez system SmartPortfel.
          </p>
        </div>
      `,
    }));

    if (response.error) {
      console.error('Resend Admin Notification API error:', response.error);
      throw new Error(`Resend error: ${JSON.stringify(response.error)}`);
    }

    return response.data;
  } catch (err: any) {
    console.error('Error sending admin notification email:', err);
    throw err;
  }
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error('RESEND_API_KEY is not defined. Password reset email not sent.');
    return;
  }

  const resend = new Resend(apiKey);
  const baseUrl = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const resetLink = `${baseUrl}/reset-password?token=${token}`;

  try {
    const fromEmail = senderEmail();

    const response = await withRetry(() => resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Resetowanie hasła – SmartPortfel',
      ...(contactEmail() ? { reply_to: contactEmail()! } : {}),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1eb3ab;">Resetowanie hasła</h2>
          
          <p>Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta SmartPortfel.</p>
          
          <p>Kliknij poniższy przycisk, aby ustawić nowe hasło. Link jest ważny przez <strong>1 godzinę</strong>.</p>
          
          <div style="margin: 30px 0;">
            <a href="${resetLink}" 
               style="background-color: #1eb3ab; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 5px; display: inline-block;">
               Zresetuj hasło
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość. Twoje hasło pozostanie bez zmian.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #666; font-size: 14px;">Jeśli przycisk nie działa, skopiuj i wklej poniższy link do przeglądarki:</p>
          <p style="color: #666; font-size: 14px;">${resetLink}</p>
        </div>
      `,
    }));

    if (response.error) {
      console.error('Resend password reset error:', response.error);
      throw new Error(`Resend error: ${JSON.stringify(response.error)}`);
    }

    return response.data;
  } catch (err: any) {
    console.error('Error sending password reset email:', err);
    throw err;
  }
};

// Zaproszenie do wspólnego gospodarstwa domowego. Brak API key => log + brak wyjątku
// (zaproszenie i tak powstaje w bazie, użytkownik może dołączyć innym kanałem).
export const sendHouseholdInvitationEmail = async (
  email: string,
  token: string,
  inviterName: string,
  householdName: string
) => {
  const apiKey = process.env.RESEND_API_KEY;
  const baseUrl = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const inviteLink = `${baseUrl}/zaproszenie?token=${token}`;

  // Dev: wypisz link, żeby dało się przetestować flow bez skonfigurowanego Resend.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Email][DEV] Link zaproszenia dla ${email}: ${inviteLink}`);
  }

  if (!apiKey) {
    console.error('RESEND_API_KEY is not defined. Household invitation email not sent.');
    return;
  }

  const resend = new Resend(apiKey);

  try {
    const fromEmail = senderEmail();

    const response = await withRetry(() => resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `${inviterName} zaprasza Cię do wspólnego budżetu w SmartPortfel`,
      ...(contactEmail() ? { reply_to: contactEmail()! } : {}),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1eb3ab;">Zaproszenie do wspólnego budżetu</h2>

          <p><strong>${inviterName}</strong> zaprasza Cię do dołączenia do gospodarstwa domowego
          „<strong>${householdName}</strong>" w SmartPortfel.</p>

          <p>Po dołączeniu będziecie wspólnie widzieć konta oznaczone jako wspólne — Twoje prywatne
          konta pozostają widoczne tylko dla Ciebie.</p>

          <div style="margin: 30px 0;">
            <a href="${inviteLink}"
               style="background-color: #1eb3ab; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 5px; display: inline-block;">
               Zobacz zaproszenie
            </a>
          </div>

          <p style="color: #666; font-size: 14px;">Jeśli nie znasz nadawcy, zignoruj tę wiadomość. Zaproszenie wygaśnie po 7 dniach.</p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #666; font-size: 14px;">Jeśli przycisk nie działa, skopiuj i wklej poniższy link do przeglądarki:</p>
          <p style="color: #666; font-size: 14px;">${inviteLink}</p>
        </div>
      `,
    }));

    if (response.error) {
      console.error('Resend household invitation error:', response.error);
      throw new Error(`Resend error: ${JSON.stringify(response.error)}`);
    }

    return response.data;
  } catch (err: any) {
    console.error('Error sending household invitation email:', err);
    // Nie przerywamy tworzenia zaproszenia z powodu błędu e-mail
  }
};
