import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, principalCV, bufferCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_SESSION_ID = 101;
const ERR_INVALID_TIMESTAMP = 102;
const ERR_INVALID_DURATION = 103;
const ERR_INVALID_TOPIC = 104;
const ERR_USER_NOT_REGISTERED = 105;
const ERR_SESSION_NOT_FOUND = 106;
const ERR_SESSION_ALREADY_EXISTS = 107;
const ERR_INVALID_STATUS = 108;
const ERR_MAX_SESSIONS_EXCEEDED = 109;
const ERR_INVALID_RATING = 110;
const ERR_SESSION_NOT_ACTIVE = 111;
const ERR_INVALID_PARTICIPANT = 112;

interface Session {
  mentor: string;
  mentee: string;
  startTime: number;
  duration: number;
  topic: string;
  status: string;
  mentorRating: number;
  menteeRating: number;
  timestamp: number;
  interactionHash: Buffer;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class SessionManagerMock {
  state: {
    nextSessionId: number;
    maxSessions: number;
    authorityContract: string | null;
    sessions: Map<number, Session>;
    sessionByParticipants: Map<string, number>;
  } = {
    nextSessionId: 0,
    maxSessions: 10000,
    authorityContract: null,
    sessions: new Map(),
    sessionByParticipants: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1MENTOR";
  authorities: Set<string> = new Set(["ST1MENTOR", "ST2MENTEE"]);

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextSessionId: 0,
      maxSessions: 10000,
      authorityContract: null,
      sessions: new Map(),
      sessionByParticipants: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1MENTOR";
    this.authorities = new Set(["ST1MENTOR", "ST2MENTEE"]);
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  bookSession(
    mentor: string,
    mentee: string,
    startTime: number,
    duration: number,
    topic: string,
    interactionHash: Buffer
  ): Result<number> {
    if (this.state.nextSessionId >= this.state.maxSessions) return { ok: false, value: ERR_MAX_SESSIONS_EXCEEDED };
    if (mentor === "SP000000000000000000002Q6VF78" || mentee === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_INVALID_PARTICIPANT };
    }
    if (startTime < this.blockHeight) return { ok: false, value: ERR_INVALID_TIMESTAMP };
    if (duration <= 0 || duration > 1440) return { ok: false, value: ERR_INVALID_DURATION };
    if (!topic || topic.length > 100) return { ok: false, value: ERR_INVALID_TOPIC };
    if (!this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const key = `${mentor}-${mentee}`;
    if (this.state.sessionByParticipants.has(key)) return { ok: false, value: ERR_SESSION_ALREADY_EXISTS };
    const id = this.state.nextSessionId;
    this.state.sessions.set(id, {
      mentor,
      mentee,
      startTime,
      duration,
      topic,
      status: "pending",
      mentorRating: 0,
      menteeRating: 0,
      timestamp: this.blockHeight,
      interactionHash,
    });
    this.state.sessionByParticipants.set(key, id);
    this.state.nextSessionId++;
    return { ok: true, value: id };
  }

  getSession(id: number): Session | null {
    return this.state.sessions.get(id) || null;
  }

  getSessionByParticipants(mentor: string, mentee: string): Result<number> {
    const key = `${mentor}-${mentee}`;
    const id = this.state.sessionByParticipants.get(key);
    return { ok: true, value: id !== undefined ? id : -1 };
  }

  updateSessionStatus(id: number, newStatus: string): Result<boolean> {
    const session = this.state.sessions.get(id);
    if (!session) return { ok: false, value: false };
    if (session.mentor !== this.caller && session.mentee !== this.caller) return { ok: false, value: false };
    if (!["pending", "active", "completed", "cancelled"].includes(newStatus)) return { ok: false, value: ERR_INVALID_STATUS };
    this.state.sessions.set(id, { ...session, status: newStatus, timestamp: this.blockHeight });
    return { ok: true, value: true };
  }

  rateSession(id: number, rating: number): Result<boolean> {
    const session = this.state.sessions.get(id);
    if (!session) return { ok: false, value: ERR_SESSION_NOT_FOUND };
    if (session.status !== "completed") return { ok: false, value: ERR_SESSION_NOT_ACTIVE };
    if (session.mentor !== this.caller && session.mentee !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (rating > 5) return { ok: false, value: ERR_INVALID_RATING };
    const updated = { ...session, timestamp: this.blockHeight };
    if (session.mentor === this.caller) {
      updated.mentorRating = rating;
    } else {
      updated.menteeRating = rating;
    }
    this.state.sessions.set(id, updated);
    return { ok: true, value: true };
  }

  getSessionCount(): Result<number> {
    return { ok: true, value: this.state.nextSessionId };
  }
}

describe("SessionManager", () => {
  let contract: SessionManagerMock;

  beforeEach(() => {
    contract = new SessionManagerMock();
    contract.reset();
  });

  it("books a session successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    const hash = Buffer.from("a".repeat(32));
    const result = contract.bookSession("ST1MENTOR", "ST2MENTEE", 100, 60, "Career Advice", hash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const session = contract.getSession(0);
    expect(session?.mentor).toBe("ST1MENTOR");
    expect(session?.mentee).toBe("ST2MENTEE");
    expect(session?.startTime).toBe(100);
    expect(session?.duration).toBe(60);
    expect(session?.topic).toBe("Career Advice");
    expect(session?.status).toBe("pending");
  });

  it("rejects session with duplicate participants", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.bookSession("ST1MENTOR", "ST2MENTEE", 100, 60, "Career Advice", Buffer.from("a".repeat(32)));
    const result = contract.bookSession("ST1MENTOR", "ST2MENTEE", 200, 90, "Tech Skills", Buffer.from("b".repeat(32)));
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_SESSION_ALREADY_EXISTS);
  });

  it("rejects session without authority contract", () => {
    const result = contract.bookSession("ST1MENTOR", "ST2MENTEE", 100, 60, "Career Advice", Buffer.from("a".repeat(32)));
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects invalid timestamp", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.blockHeight = 200;
    const result = contract.bookSession("ST1MENTOR", "ST2MENTEE", 100, 60, "Career Advice", Buffer.from("a".repeat(32)));
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TIMESTAMP);
  });

  it("rejects invalid duration", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.bookSession("ST1MENTOR", "ST2MENTEE", 100, 1500, "Career Advice", Buffer.from("a".repeat(32)));
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DURATION);
  });

  it("updates session status successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.bookSession("ST1MENTOR", "ST2MENTEE", 100, 60, "Career Advice", Buffer.from("a".repeat(32)));
    const result = contract.updateSessionStatus(0, "active");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const session = contract.getSession(0);
    expect(session?.status).toBe("active");
  });

  it("rejects status update by non-participant", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.bookSession("ST1MENTOR", "ST2MENTEE", 100, 60, "Career Advice", Buffer.from("a".repeat(32)));
    contract.caller = "ST3FAKE";
    const result = contract.updateSessionStatus(0, "active");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rates session successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.bookSession("ST1MENTOR", "ST2MENTEE", 100, 60, "Career Advice", Buffer.from("a".repeat(32)));
    contract.updateSessionStatus(0, "completed");
    const result = contract.rateSession(0, 4);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const session = contract.getSession(0);
    expect(session?.mentorRating).toBe(4);
  });

  it("rejects rating for non-completed session", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.bookSession("ST1MENTOR", "ST2MENTEE", 100, 60, "Career Advice", Buffer.from("a".repeat(32)));
    const result = contract.rateSession(0, 4);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_SESSION_NOT_ACTIVE);
  });
});