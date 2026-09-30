const request = require("supertest");
const app = require("../src/app");
const db = require("../src/db");
const { truncateAll, closeDb } = require("./helpers/db");
const { registerPatient, uniqueEmail, VALID_PASSWORD } = require("./helpers/factories");

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await closeDb(); });

describe("POST /api/auth/register", () => {
  it("creates a real account and always assigns the Patient role, even if a different role is sent", async () => {
    const email = uniqueEmail("reg");
    const res = await request(app).post("/api/auth/register").send({
      name: "Jamie Doe", email, password: VALID_PASSWORD, dob: "1995-05-01", gender: "Female",
      role: "Administrator", // must be silently ignored — registration can never grant a role
    }).expect(201);

    expect(res.body.user.role).toBe("Patient");

    const { rows } = await db.query("SELECT role, gender FROM users WHERE email = $1", [email.toLowerCase()]);
    expect(rows[0].role).toBe("Patient");
    expect(rows[0].gender).toBe("Female");
  });

  it("rejects a password shorter than 6 characters", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Short Pw", email: uniqueEmail("short"), password: "abc12", dob: "1990-01-01", gender: "Male",
    }).expect(400);
    expect(res.body.error).toMatch(/6 characters/);
  });

  it("accepts a 6-character password (the real minimum, not the old 10-char rule)", async () => {
    await request(app).post("/api/auth/register").send({
      name: "Min Pw", email: uniqueEmail("minpw"), password: "abc123", dob: "1990-01-01", gender: "Male",
    }).expect(201);
  });

  it("requires date of birth", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "No Dob", email: uniqueEmail("nodob"), password: VALID_PASSWORD, gender: "Male",
    }).expect(400);
    expect(res.body.error).toMatch(/date of birth/i);
  });

  it("requires gender to be Male or Female", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Bad Gender", email: uniqueEmail("badgender"), password: VALID_PASSWORD, dob: "1990-01-01", gender: "Other",
    }).expect(400);
    expect(res.body.error).toMatch(/gender/i);
  });

  it("rejects a duplicate email", async () => {
    const email = uniqueEmail("dup");
    await request(app).post("/api/auth/register").send({
      name: "First", email, password: VALID_PASSWORD, dob: "1990-01-01", gender: "Male",
    }).expect(201);
    await request(app).post("/api/auth/register").send({
      name: "Second", email, password: VALID_PASSWORD, dob: "1990-01-01", gender: "Male",
    }).expect(409);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials and returns an access token", async () => {
    const email = uniqueEmail("login");
    await request(app).post("/api/auth/register").send({
      name: "Login Test", email, password: VALID_PASSWORD, dob: "1990-01-01", gender: "Male",
    });
    const res = await request(app).post("/api/auth/login").send({ email, password: VALID_PASSWORD }).expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.role).toBe("Patient");
  });

  it("rejects the wrong password with a generic message (no user-enumeration hint)", async () => {
    const email = uniqueEmail("wrongpw");
    await request(app).post("/api/auth/register").send({
      name: "Wrong Pw", email, password: VALID_PASSWORD, dob: "1990-01-01", gender: "Male",
    });
    const res = await request(app).post("/api/auth/login").send({ email, password: "totallyWrong1" }).expect(401);
    expect(res.body.error).toBe("Invalid email or password.");
  });

  it("returns the same generic error for a non-existent email as for a wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: uniqueEmail("nobody"), password: "whatever1" }).expect(401);
    expect(res.body.error).toBe("Invalid email or password.");
  });

  it("blocks login for a suspended account", async () => {
    const email = uniqueEmail("suspended");
    await request(app).post("/api/auth/register").send({
      name: "Suspended", email, password: VALID_PASSWORD, dob: "1990-01-01", gender: "Male",
    });
    await db.query("UPDATE users SET status = 'Suspended' WHERE email = $1", [email.toLowerCase()]);
    const res = await request(app).post("/api/auth/login").send({ email, password: VALID_PASSWORD }).expect(403);
    expect(res.body.error).toMatch(/suspended/i);
  });
});

describe("POST /api/auth/refresh + Remember Me", () => {
  it("issues a session cookie without persistence when Remember Me is off", async () => {
    const email = uniqueEmail("nosession");
    await request(app).post("/api/auth/register").send({
      name: "No Remember", email, password: VALID_PASSWORD, dob: "1990-01-01", gender: "Male",
    });
    const res = await request(app).post("/api/auth/login").send({ email, password: VALID_PASSWORD, rememberMe: false }).expect(200);
    const cookieHeader = res.headers["set-cookie"].find((c) => c.startsWith("mc_refresh"));
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader.toLowerCase()).not.toContain("max-age"); // real session cookie, not persistent
  });

  it("issues a persistent cookie when Remember Me is on", async () => {
    const email = uniqueEmail("remember");
    await request(app).post("/api/auth/register").send({
      name: "Remember", email, password: VALID_PASSWORD, dob: "1990-01-01", gender: "Male",
    });
    const res = await request(app).post("/api/auth/login").send({ email, password: VALID_PASSWORD, rememberMe: true }).expect(200);
    const cookieHeader = res.headers["set-cookie"].find((c) => c.startsWith("mc_refresh"));
    expect(cookieHeader.toLowerCase()).toContain("max-age");
  });

  it("rotates the refresh token and issues a new access token", async () => {
    const email = uniqueEmail("rotate");
    await request(app).post("/api/auth/register").send({
      name: "Rotate", email, password: VALID_PASSWORD, dob: "1990-01-01", gender: "Male",
    });
    const loginRes = await request(app).post("/api/auth/login").send({ email, password: VALID_PASSWORD });
    const cookie = loginRes.headers["set-cookie"];

    const refreshRes = await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(200);
    expect(refreshRes.body.accessToken).toBeTruthy();
    expect(refreshRes.body.accessToken).not.toBe(loginRes.body.accessToken);
  });

  it("rejects a reused (already-rotated) refresh token", async () => {
    const email = uniqueEmail("reuse");
    await request(app).post("/api/auth/register").send({
      name: "Reuse", email, password: VALID_PASSWORD, dob: "1990-01-01", gender: "Male",
    });
    const loginRes = await request(app).post("/api/auth/login").send({ email, password: VALID_PASSWORD });
    const cookie = loginRes.headers["set-cookie"];

    await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(200);
    await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(401); // same cookie again — already revoked
  });
});

describe("POST /api/auth/change-password", () => {
  it("changes the password when the current password is correct", async () => {
    const session = await registerPatient(app);
    await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ currentPassword: VALID_PASSWORD, newPassword: "NewPass123" })
      .expect(200);

    await request(app).post("/api/auth/login").send({ email: session.user.email, password: "NewPass123" }).expect(200);
  });

  it("rejects the change when the current password is wrong", async () => {
    const session = await registerPatient(app);
    await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ currentPassword: "wrongCurrent1", newPassword: "NewPass123" })
      .expect(401);
  });

  it("requires authentication", async () => {
    await request(app).post("/api/auth/change-password").send({ currentPassword: "x", newPassword: "NewPass123" }).expect(401);
  });
});
