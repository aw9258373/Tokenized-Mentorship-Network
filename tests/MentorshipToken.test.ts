import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 300;
const ERR_INVALID_AMOUNT = 301;
const ERR_INSUFFICIENT_BALANCE = 302;
const ERR_INVALID_RECIPIENT = 303;
const ERR_MAX_SUPPLY_EXCEEDED = 304;
const ERR_INVALID_STAKE_AMOUNT = 305;
const ERR_ALREADY_STAKED = 306;
const ERR_NO_STAKE_FOUND = 307;

interface Result<T> {
  ok: boolean;
  value: T;
}

class MentorshipTokenMock {
  state: {
    totalSupply: number;
    balances: Map<string, number>;
    stakes: Map<string, number>;
    totalStaked: number;
    authorityContract: string | null;
  } = {
    totalSupply: 0,
    balances: new Map(),
    stakes: new Map(),
    totalStaked: 0,
    authorityContract: null,
  };
  caller: string = "ST1MENTOR";
  contractAddress: string = "STCONTRACT";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      totalSupply: 0,
      balances: new Map(),
      stakes: new Map(),
      totalStaked: 0,
      authorityContract: null,
    };
    this.caller = "ST1MENTOR";
    this.contractAddress = "STCONTRACT";
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: false };
    if (this.state.authorityContract !== null)
      return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  mint(amount: number, recipient: string): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (recipient === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (this.state.totalSupply + amount > 1000000000)
      return { ok: false, value: ERR_MAX_SUPPLY_EXCEEDED };
    const currentBalance = this.state.balances.get(recipient) || 0;
    this.state.balances.set(recipient, currentBalance + amount);
    this.state.totalSupply += amount;
    return { ok: true, value: true };
  }

  transfer(amount: number, sender: string, recipient: string): Result<boolean> {
    if (this.caller !== sender) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (recipient === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_RECIPIENT };
    const senderBalance = this.state.balances.get(sender) || 0;
    if (senderBalance < amount)
      return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    const recipientBalance = this.state.balances.get(recipient) || 0;
    this.state.balances.set(sender, senderBalance - amount);
    this.state.balances.set(recipient, recipientBalance + amount);
    return { ok: true, value: true };
  }

  stakeTokens(amount: number): Result<boolean> {
    if (amount <= 0) return { ok: false, value: ERR_INVALID_STAKE_AMOUNT };
    if (this.state.stakes.has(this.caller))
      return { ok: false, value: ERR_ALREADY_STAKED };
    const balance = this.state.balances.get(this.caller) || 0;
    if (balance < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    this.state.balances.set(this.caller, balance - amount);
    this.state.stakes.set(this.caller, amount);
    this.state.totalStaked += amount;
    return { ok: true, value: true };
  }

  unstakeTokens(): Result<boolean> {
    const stakeAmount = this.state.stakes.get(this.caller) || 0;
    if (stakeAmount === 0) return { ok: false, value: ERR_NO_STAKE_FOUND };
    const balance = this.state.balances.get(this.caller) || 0;
    this.state.balances.set(this.caller, balance + stakeAmount);
    this.state.stakes.delete(this.caller);
    this.state.totalStaked -= stakeAmount;
    return { ok: true, value: true };
  }

  burn(amount: number, owner: string): Result<boolean> {
    if (this.caller !== owner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    const balance = this.state.balances.get(owner) || 0;
    if (balance < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    this.state.balances.set(owner, balance - amount);
    this.state.totalSupply -= amount;
    return { ok: true, value: true };
  }

  getTotalSupply(): Result<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  getBalance(account: string): Result<number> {
    return { ok: true, value: this.state.balances.get(account) || 0 };
  }

  getStakedBalance(account: string): Result<number> {
    return { ok: true, value: this.state.stakes.get(account) || 0 };
  }

  getTotalStaked(): Result<number> {
    return { ok: true, value: this.state.totalStaked };
  }
}

describe("MentorshipToken", () => {
  let contract: MentorshipTokenMock;

  beforeEach(() => {
    contract = new MentorshipTokenMock();
    contract.reset();
  });

  it("mints tokens successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.mint(1000, "ST1MENTOR");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getBalance("ST1MENTOR").value).toBe(1000);
    expect(contract.getTotalSupply().value).toBe(1000);
  });

  it("rejects mint without authority", () => {
    const result = contract.mint(1000, "ST1MENTOR");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("transfers tokens successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.mint(1000, "ST1MENTOR");
    const result = contract.transfer(500, "ST1MENTOR", "ST2MENTEE");
    expect(result.ok).toBe(true);
    expect(contract.getBalance("ST1MENTOR").value).toBe(500);
    expect(contract.getBalance("ST2MENTEE").value).toBe(500);
  });

  it("rejects transfer with insufficient balance", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.mint(100, "ST1MENTOR");
    const result = contract.transfer(200, "ST1MENTOR", "ST2MENTEE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("stakes tokens successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.mint(1000, "ST1MENTOR");
    const result = contract.stakeTokens(500);
    expect(result.ok).toBe(true);
    expect(contract.getStakedBalance("ST1MENTOR").value).toBe(500);
    expect(contract.getTotalStaked().value).toBe(500);
    expect(contract.getBalance("ST1MENTOR").value).toBe(500);
  });

  it("unstakes tokens successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.mint(1000, "ST1MENTOR");
    contract.stakeTokens(500);
    const result = contract.unstakeTokens();
    expect(result.ok).toBe(true);
    expect(contract.getStakedBalance("ST1MENTOR").value).toBe(0);
    expect(contract.getBalance("ST1MENTOR").value).toBe(1000);
  });

  it("burns tokens successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.mint(1000, "ST1MENTOR");
    const result = contract.burn(300, "ST1MENTOR");
    expect(result.ok).toBe(true);
    expect(contract.getBalance("ST1MENTOR").value).toBe(700);
    expect(contract.getTotalSupply().value).toBe(700);
  });
});
