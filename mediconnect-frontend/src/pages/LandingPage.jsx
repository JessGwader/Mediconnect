import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import logo from "../assets/logo-mark.png";
import "./landing.css";

export function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <img src={logo} alt="" />
          <span className="display">{t("app_name")}</span>
        </div>
        <nav className="landing-nav-links">
          <a href="#features">{t("landing.nav_features")}</a>
          <a href="#how">{t("landing.nav_how")}</a>
          <a href="#clinicians">{t("landing.nav_clinicians")}</a>
        </nav>
        <div className="landing-nav-actions">
          <LanguageSwitcher />
          <Link to="/login" className="landing-link-btn">{t("landing.sign_in")}</Link>
          <Link to="/register" className="btn small">{t("landing.get_started")}</Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <h1>{t("landing.hero_title")}</h1>
          <p>{t("landing.hero_subtitle")}</p>
          <div className="landing-hero-actions">
            <Link to="/register" className="btn">{t("landing.hero_cta_primary")}</Link>
            <Link to="/login" className="btn ghost">{t("landing.hero_cta_secondary")}</Link>
          </div>
        </div>

        <div className="landing-hero-visual" aria-hidden="true">
          <div className="hero-card hero-card-appointment">
            <div className="hero-card-label">{t("landing.hero_card_appointment_title")}</div>
            <div className="hero-card-main">{t("landing.hero_card_appointment_doctor")}</div>
            <div className="hero-card-sub">🕑 {t("landing.hero_card_appointment_time")}</div>
          </div>
          <div className="hero-card hero-card-message">
            <span>💬</span>
            <div className="hero-card-sub">{t("landing.hero_card_message")}</div>
          </div>
          <div className="hero-card hero-card-payment">
            <span>✓</span>
            <div className="hero-card-sub">{t("landing.hero_card_payment")}</div>
          </div>
        </div>
      </section>

      <section className="landing-how" id="how">
        <h2>{t("landing.how_title")}</h2>
        <div className="landing-how-grid">
          <div className="how-step">
            <div className="how-num">1</div>
            <h3>{t("landing.how_1_title")}</h3>
            <p>{t("landing.how_1_body")}</p>
          </div>
          <div className="how-step">
            <div className="how-num">2</div>
            <h3>{t("landing.how_2_title")}</h3>
            <p>{t("landing.how_2_body")}</p>
          </div>
          <div className="how-step">
            <div className="how-num">3</div>
            <h3>{t("landing.how_3_title")}</h3>
            <p>{t("landing.how_3_body")}</p>
          </div>
        </div>
      </section>

      <section className="landing-features" id="features">
        <h2>{t("landing.features_title")}</h2>
        <div className="landing-features-grid">
          <div className="feature-card">
            <span className="feature-icon">🩺</span>
            <h3>{t("landing.feature_verified_title")}</h3>
            <p>{t("landing.feature_verified_body")}</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">💬</span>
            <h3>{t("landing.feature_messaging_title")}</h3>
            <p>{t("landing.feature_messaging_body")}</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">⚕️</span>
            <h3>{t("landing.feature_prescriptions_title")}</h3>
            <p>{t("landing.feature_prescriptions_body")}</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">💳</span>
            <h3>{t("landing.feature_payments_title")}</h3>
            <p>{t("landing.feature_payments_body")}</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">📄</span>
            <h3>{t("landing.feature_records_title")}</h3>
            <p>{t("landing.feature_records_body")}</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🌐</span>
            <h3>{t("landing.feature_languages_title")}</h3>
            <p>{t("landing.feature_languages_body")}</p>
          </div>
        </div>
      </section>

      <section className="landing-clinicians" id="clinicians">
        <div className="clinicians-card">
          <div>
            <h2>{t("landing.clinicians_title")}</h2>
            <p>{t("landing.clinicians_body")}</p>
          </div>
          <Link to="/register?intent=Doctor" className="btn">{t("landing.clinicians_cta")}</Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-brand">
          <img src={logo} alt="" />
          <span className="display">{t("app_name")}</span>
        </div>
        <div className="landing-footer-tagline">{t("landing.footer_tagline")}</div>
        <div className="landing-footer-links">
          <Link to="/login">{t("landing.sign_in")}</Link>
          <Link to="/register">{t("landing.get_started")}</Link>
        </div>
        <div className="landing-footer-rights">© {new Date().getFullYear()} {t("app_name")} — {t("landing.footer_rights")}</div>
      </footer>
    </div>
  );
}
