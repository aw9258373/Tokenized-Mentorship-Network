import { describe, it, expect, beforeEach } from "vitest";
import {
  stringUtf8CV,
  uintCV,
  principalCV,
  listCV,
  someCV,
  noneCV,
} from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 200;
const ERR_INVALID_USERNAME = 201;
const ERR_INVALID_EXPERTISE = 202;
const ERR_INVALID_AVAILABILITY = 203;
const ERR_INVALID_ROLE = 204;
const ERR_USER_ALREADY_EXISTS = 205;
const ERR_USER_NOT_FOUND = 206;
const ERR_MAX_USERS_EXCEEDED = 207;
const ERR_INVALID_GOALS = 208;
const ERR_INVALID_SKILLS = 209;
const ERR_INVALID_PROFILE_UPDATE = 210;

interface User {
  id: number;
  username: string;
  role: string;
  expertise: string[];
  availability: number;
  goals: string[];
  skills: string[];
  timestamp: number;
  active: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class UserRegistryMock {
  state: {
    nextUserId: number;
    maxUsers: number;
    authorityContract: string | null;
    users: Map<number, User>;
    usersByUsername: Map<string, number>;
    userByPrincipal: Map<string, number>;
  } = {
    nextUserId: 0,
    maxUsers: 5000,
    authorityContract: null,
    users: new Map(),
    usersByUsername: new Map(),
    userByPrincipal: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1MENTOR";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextUserId: 0,
      maxUsers: 5000,
      authorityContract: null,
      users: new Map(),
      usersByUsername: new Map(),
      userByPrincipal: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1MENTOR";
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: false };
    if (this.state.authorityContract !== null)
      return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  registerUser(
    username: string,
    role: string,
    expertise: string[],
    availability: number,
    goals: string[],
    skills: string[]
  ): Result<number> {
    if (this.state.nextUserId >= this.state.maxUsers)
      return { ok: false, value: ERR_MAX_USERS_EXCEEDED };
    if (!username || username.length > 50)
      return { ok: false, value: ERR_INVALID_USERNAME };
    if (!["mentor", "mentee"].includes(role))
      return { ok: false, value: ERR_INVALID_ROLE };
    if (expertise.length > 10)
      return { ok: false, value: ERR_INVALID_EXPERTISE };
    if (availability > 168)
      return { ok: false, value: ERR_INVALID_AVAILABILITY };
    if (goals.length > 5) return { ok: false, value: ERR_INVALID_GOALS };
    if (skills.length > 10) return { ok: false, value: ERR_INVALID_SKILLS };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.usersByUsername.has(username))
      return { ok: false, value: ERR_USER_ALREADY_EXISTS };
    if (this.state.userByPrincipal.has(this.caller))
      return { ok: false, value: ERR_USER_ALREADY_EXISTS };
    const id = this.state.nextUserId;
    const user: User = {
      id,
      username,
      role,
      expertise,
      availability,
      goals,
      skills,
      timestamp: this.blockHeight,
      active: true,
    };
    this.state.users.set(id, user);
    this.state.usersByUsername.set(username, id);
    this.state.userByPrincipal.set(this.caller, id);
    this.state.nextUserId++;
    return { ok: true, value: id };
  }

  getUser(id: number): User | null {
    return this.state.users.get(id) || null;
  }

  getUserByUsername(username: string): User | null {
    const id = this.state.usersByUsername.get(username);
    return id !== undefined ? this.state.users.get(id) || null : null;
  }

  getUserByPrincipal(p: string): User | null {
    const id = this.state.userByPrincipal.get(p);
    return id !== undefined ? this.state.users.get(id) || null : null;
  }

  isUserRegistered(username: string): boolean {
    return this.state.usersByUsername.has(username);
  }

  updateUserProfile(
    userId: number,
    newUsername?: string,
    newExpertise?: string[],
    newAvailability?: number,
    newGoals?: string[]
  ): Result<boolean> {
    const user = this.state.users.get(userId);
    if (!user) return { ok: false, value: false };
    if (newUsername) {
      if (newUsername.length > 50) return { ok: false, value: false };
      if (
        this.state.usersByUsername.has(newUsername) &&
        this.state.usersByUsername.get(newUsername) !== userId
      ) {
        return { ok: false, value: ERR_USER_ALREADY_EXISTS };
      }
      this.state.usersByUsername.delete(user.username);
      this.state.usersByUsername.set(newUsername, userId);
    }
    if (newExpertise && newExpertise.length > 10)
      return { ok: false, value: false };
    if (newAvailability && newAvailability > 168)
      return { ok: false, value: false };
    if (newGoals && newGoals.length > 5) return { ok: false, value: false };
    this.state.users.set(userId, {
      ...user,
      username: newUsername || user.username,
      expertise: newExpertise || user.expertise,
      availability: newAvailability || user.availability,
      goals: newGoals || user.goals,
      timestamp: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  deactivateUser(userId: number): Result<boolean> {
    const user = this.state.users.get(userId);
    if (!user) return { ok: false, value: false };
    this.state.users.set(userId, { ...user, active: false });
    return { ok: true, value: true };
  }

  getUserCount(): Result<number> {
    return { ok: true, value: this.state.nextUserId };
  }
}

describe("UserRegistry", () => {
  let contract: UserRegistryMock;

  beforeEach(() => {
    contract = new UserRegistryMock();
    contract.reset();
  });

  it("registers a user successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.registerUser(
      "mentor1",
      "mentor",
      ["JS", "Clarity"],
      40,
      ["Teach Web3"],
      ["Coding", "Mentoring"]
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const user = contract.getUser(0);
    expect(user?.username).toBe("mentor1");
    expect(user?.role).toBe("mentor");
    expect(user?.expertise).toEqual(["JS", "Clarity"]);
    expect(user?.active).toBe(true);
  });

  it("rejects duplicate username", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.registerUser(
      "mentor1",
      "mentor",
      ["JS"],
      40,
      ["Teach"],
      ["Coding"]
    );
    const result = contract.registerUser(
      "mentor1",
      "mentee",
      ["Python"],
      20,
      ["Learn"],
      ["Beginner"]
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_USER_ALREADY_EXISTS);
  });

  it("rejects without authority", () => {
    const result = contract.registerUser(
      "mentor1",
      "mentor",
      ["JS"],
      40,
      ["Teach"],
      ["Coding"]
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects invalid role", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.registerUser(
      "invalid",
      "admin",
      ["JS"],
      40,
      ["Teach"],
      ["Coding"]
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE);
  });

  it("updates profile successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.registerUser(
      "mentor1",
      "mentor",
      ["JS"],
      40,
      ["Teach"],
      ["Coding"]
    );
    const result = contract.updateUserProfile(
      0,
      "mentor_updated",
      ["JS", "Rust"],
      50
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const user = contract.getUser(0);
    expect(user?.username).toBe("mentor_updated");
    expect(user?.expertise).toEqual(["JS", "Rust"]);
  });

  it("deactivates user successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.registerUser(
      "mentor1",
      "mentor",
      ["JS"],
      40,
      ["Teach"],
      ["Coding"]
    );
    const result = contract.deactivateUser(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const user = contract.getUser(0);
    expect(user?.active).toBe(false);
  });

  it("retrieves user by username", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.registerUser(
      "mentor1",
      "mentor",
      ["JS"],
      40,
      ["Teach"],
      ["Coding"]
    );
    const user = contract.getUserByUsername("mentor1");
    expect(user?.username).toBe("mentor1");
  });
});
