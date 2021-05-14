/*
export type TestHookType = 'beforeAll' | 'beforeEach' | 'afterAll' | 'afterEach'
import toMilliseconds from 'ms'

import { setTimeout as _asyncSetTimeout } from 'timers/promises'

//xxx.setTimeout(123, undefined, { signal })

const asyncSetTimeout = _asyncSetTimeout

export interface TestEntityOptions {
  title?: string
  timeout?: number
  retries?: number
  parallel?: boolean
  skip?: boolean
  only?: boolean
}

const { max: mathMax, min: mathMin } = Math

const getTime = Date.now

export interface SuiteOptions extends TestEntityOptions {}

export interface TestOptions extends TestEntityOptions {}

export class Context {}

export type Action<T = void> = (this: Context) => Promise<T> | T

const noop = () => undefined

export type RunnableState = 'idle' | 'running' | 'success' | 'error' | 'timeout' | 'abort'

export const isPromiseLike = <T>(p: any): p is PromiseLike<T> =>
  typeof p === 'object' && p !== null && typeof p.then === 'function'

export abstract class Runnable<T = void> {
  public readonly fn: Action<T>

  private _timeout: number = 0
  private _duration: number = 0
  private _state: RunnableState = 'idle'
  private _promise: Promise<T> | null = null
  private _execute: Promise<T> | null = null
  private _promiseResolve: (value: T | PromiseLike<T>) => void = noop
  private _promiseReject: (reason?: any) => void = noop
  private _updateTimeout: () => void = noop
  private _abort: (error: Error) => void = noop

  public constructor(fn: Action<T>) {
    this.fn = fn
  }

  public get timeout(): number {
    return this._timeout
  }

  public set timeout(value: number) {
    this.setTimeout(value)
  }

  public get state(): RunnableState {
    return this._state
  }

  /**
   * Duration since started, in millisecods.
   * @returns Duration in milliseconds
   *
  public duration(): number | null {
    return this._state === 'running' ? (this._duration !== 0 ? getTime() - this._duration : 0) : this._duration
  }

  public abstract get context(): Context

  public abort(error?: Error | string | null) {
    if (this._abort !== noop || this._promiseReject !== noop) {
      if (typeof error !== 'object' || error === null) {
        error = new Error(error || 'Operation aborted')
        ;(error as any).code = 'EABORTED'
        Error.captureStackTrace(error, this.abort)
      }
      if (this._state === 'idle') {
        this._promiseReject(error)
        this._promiseReject = noop
      } else {
        this._abort(error)
        this._abort = noop
      }
      return true
    }
    return false
  }

  public reset() {
    if (this._state !== 'idle') {
      this.abort()
    }
    this._state = 'idle'
    this._duration = 0
    this._execute = null
    this._promise = null
    this._promiseResolve = noop
    this._promiseReject = noop
    this._abort = noop
  }

  public setTimeout(ms: number | string | null): void {
    const value = mathMin(0x7fffffff, mathMax(0, (typeof ms === 'string' ? toMilliseconds(ms) : ms && +ms) || 0))
    this._timeout = value
    this._updateTimeout()
  }

  public promise(): Promise<T> {
    return (
      this._execute ||
      this._promise ||
      (this._promise = new Promise<T>((resolve, reject) => {
        this._promiseResolve = resolve
        this._promiseReject = reject
      }))
    )
  }

  public execute(): Promise<T> {
    let promise = this._execute
    if (!promise) {
      this._state = 'running'
      promise = this.onExecute()
      this._execute = promise
    }
    return promise
  }

  protected async onExecute(): Promise<T> {
    if (this._state != 'running') {
      throw new Error('Aborted')
    }

    const abortPromise = new Promise<T>((_, reject) => {
      const updateTimeout = () => {
        if (timer !== null) {
          clearTimeout(timer)
        }
        const timeout = this.timeout
        if (timeout > 0) {
          const timedOut = () => {
            const err = new Error(`Timeout of ${timeout}ms exceeded.`) as any
            err.code = 'ETIMEDOUT'
            err.timeout = timeout
            reject(err)
          }
          timer = setTimeout(timedOut, timeout)
        } else {
          timer = null
        }
      }

      this._updateTimeout = updateTimeout
    })

    let timer: ReturnType<typeof setTimeout> | null = null

    try {
      this._updateTimeout()
      this._duration = getTime()
      const fnResult = this.fn.call(this.context)

      const result = isPromiseLike(fnResult) ? await Promise.race([abortPromise, fnResult]) : fnResult

      this._duration = getTime() - this._duration

      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }

      this._state = 'success'
      this._promiseResolve(result)

      this._promiseResolve = noop
      this._promiseReject = noop
      this._updateTimeout = noop
      this._abort = noop

      return result
    } catch (e) {
      if (timer !== null) {
        clearTimeout(timer)
      }

      if (this._state === 'running') {
        this._state = 'error'
        this._duration = getTime() - this._duration
        this._promiseReject(e)
      }

      this._promiseResolve = noop
      this._promiseReject = noop
      this._updateTimeout = noop
      this._abort = noop

      throw e
    }
  }
}

export class Test extends Runnable<void> {
  public get context(): Context {
    throw new Error('Method not implemented.')
  }
}

export class Hook<T = any> extends Runnable<T> {
  public get context(): Context {
    throw new Error('Method not implemented.')
  }
}

export class Suite {}


export type HookFunction<T = any> = (this: Context, context: Context) => T

export type SuiteFunction = (this: Context, context: Context) => void

export type TestFunction = (this: Context, context: Context) => void

const noop = () => {}
const { defineProperty } = Reflect

export interface TestEntity {}

export interface TestError extends Error {
  _test?: TestEntity
}

export const makeError = (error: any, entity?: TestEntity) => {
  if (!(error instanceof Error)) {
    return new Error(error)
  }
  if (entity && !(error as TestError)._test) {
    defineProperty(error, '_test', { value: entity, configurable: true, enumerable: false, writable: false })
  }
  return error
}

export class Context {
  [key: string]: any

  public readonly suite: Suite

  public constructor(suite: Suite) {
    defineProperty(this, 'suite', { value: suite, configurable: true, enumerable: true, writable: false })
  }

  public static createChildContext<TContext extends Context>(parentContext: TContext, suite: Suite): TContext {
    function SuiteContext() {}

    SuiteContext.prototype = parentContext
    const result = new (SuiteContext as any)() as TContext
    defineProperty(result, 'suite', { value: suite, configurable: true, enumerable: true, writable: false })
    return result
  }
}

export class Hook implements TestEntity {
  private _promise: Promise<any> | null = null
  private _resolve: (value: any) => void = noop
  private _reject: (value: any) => void = noop

  public error: Error | null = null

  public constructor(
    public readonly type: TestHookType,
    public readonly suite: Suite,
    public readonly index: number,
    public title: string,
    public fn: HookFunction<any>
  ) {
    this.title = title || fn.name
    this.type = type
    this.index = index
    this.suite = suite
    this.fn = fn
  }

  public getPromise() {
    return this._promise || this.createPromise()
  }

  public async invoke(): Promise<void> {
    this.getPromise()
    try {
      const context = this.suite.context
      const result = await this.fn.call(context, context)
      this._resolve(result)
    } catch (e) {
      const error = makeError(e, this)
      this.error = error
      this._reject(error)
    }
  }

  public toString(): string {
    return `${this.type}: ${this.title || this.index}`
  }

  protected createPromise(): Promise<any> {
    let promise = this._promise
    if (!promise) {
      promise = new Promise((resolve, reject) => {
        this._resolve = resolve
        this._reject = reject
      })
      promise.catch(noop)
      this._promise = promise
    }
    return promise
  }
}

export class Test {
  public constructor(public readonly suite: Suite, public title: string, public fn: TestFunction) {
    this.suite = suite
    this.title = title || fn.name
    this.fn = fn
  }

  public toString(): string {
    return `Test: ${this.title}`
  }
}

export class Suite {
  public static default: Suite = new Suite(null, 'default')

  public readonly suites: Suite[] = []
  public readonly tests: Test[] = []

  public readonly beforeAllList: Hook[] = []
  public readonly afterAllList: Hook[] = []
  public readonly beforeEachList: Hook[] = []
  public readonly afterEachList: Hook[] = []

  private _context: Context | null = null

  public constructor(public readonly suite: Suite | null, public title: string) {
    this.suite = suite
    this.title = title
  }

  public get context(): Context {
    return (
      this._context ||
      (this._context = this.suite ? this.createChildContext(this.suite.context) : this.createNewContext())
    )
  }

  public set context(value: Context) {
    this._context = value
  }

  public createNewContext() {
    return new Context(this)
  }

  public createChildContext(parentContext: Context = this.context) {
    return Context.createChildContext(parentContext, this)
  }

  public addHook(type: TestHookType, title: string, fn: HookFunction): Hook {
    const hook = new Hook(type, this, this.afterEachList.length, title, fn)
    this[type].push(hook)
    return hook
  }

  public addTest(title: string, fn: TestFunction): Test {
    const test = new Test(this, title, fn)
    this.tests.push(test)
    return test
  }

  public addSuite(title: string): Suite {
    const suite = new Suite(this, title)
    this.suites.push(suite)
    return suite
  }

  public toString(): string {
    return `Suite: ${this.title}`
  }
}

export interface TestInterface {
  describe(title: string, fn: SuiteFunction): void
  it(title: string, fn: SuiteFunction): void

  beforeEach(fn: HookFunction): void
  beforeEach(title: string, fn: HookFunction): void
}

export interface HookDefine {
  <T>(fn: () => T): Promise<T>
  <T>(title: string, fn: () => T): Promise<T>
}

export const createTestInterface = (root: Suite = Suite.default) => {
  let current: Suite = root

  const describe = (title: string, fn: SuiteFunction) => {
    const previous = current
    const suite = current.addSuite(title)
    current = suite
    try {
      fn()
    } finally {
      current = previous
    }
  }

  const makeHook = (type: TestHookType) => {
    const result: HookDefine = (titleOrFn: string | HookFunction, fn?: HookFunction) => {
      const title = typeof titleOrFn === 'string' ? titleOrFn : titleOrFn.name
      const xfn = typeof titleOrFn === 'function' ? titleOrFn : fn
      return current.addHook(type, title, xfn).promise
    }
    defineProperty(result, 'name', { value: type, configurable: true, enumerable: false, writable: false })
    return result
  }

  const it = (title: string, fn: TestFunction) => {
    current.addTest(title, fn)
  }

  return {
    rootSuite: root,
    getSuite() {
      return current
    },
    describe,
    it,
    beforeAll: makeHook('beforeAll'),
    beforeEach: makeHook('beforeEach'),
    afterEach: makeHook('afterEach'),
    afterAll: makeHook('afterAll')
  }
}

const estest = createTestInterface()

export const describe = estest.describe

export const it = estest.it

export const beforeAll = estest.beforeAll

export const beforeEach = estest.beforeEach

export const afterAll = estest.afterAll

export const afterEach = estest.afterEach

export class TestInterface {
  public readonly root: Suite
  public current: Suite

  public static default = new TestInterface(new Suite(null, 'default'))
  public static active = TestInterface.default

  public constructor(root: Suite) {
    this.root = root
    this.current = root
  }

  public describe(title: string, fn: SuiteFunction) {
    const previous = this.current
    const suite = this.current.addSuite(title)
    this.current = suite
    try {
      fn()
    } finally {
      this.current = previous
    }
  }

  public it(title: string, fn: TestFunction) {
    this.current.addTest(title, fn)
  }
}

export const describe = (title: string, fn: SuiteFunction) => TestInterface.active.describe(title, fn)

export const it = (title: string, fn: TestFunction) => TestInterface.active.it(title, fn)

export const beforeEach = (title: string, fn: TestFunction) => TestInterface.active.it(title, fn)

/*
export type TestHookType = 'beforeAll' | 'beforeEach' | 'afterAll' | 'afterEach'

export type TestEntityType = TestHookType | 'test' | 'suite'

export type TestEntityFunction = () => any

export type TestSuiteFunction = () => void

export type TestFunction = () => any

export type TestHookFunction = () => T

export class TestEntity {
  public readonly title: string
  public readonly type: TestEntityType
  public readonly index: number
  public readonly parent: Suite | null

  public only: boolean = false
  public skip: boolean = false

  public constructor(type: TestEntityType, parent: Suite | null, index: number, title: string | undefined | null) {
    this.title = title || `${type}${index}`
    this.type = type
    this.index = index
    this.parent = parent
  }

  public toString(): string {
    return `${this.constructor.name}: ${this.title}`
  }
}

const ensureFunctionName = (type: string, index: number, fn: () => any) => {
  if (!fn.name) {
    defineProperty(fn, 'name', {
      value: `${type}${index}`,
      configurable: true,
      enumerable: false,
      writable: false
    })
  }
}

export class TestHook extends TestEntity {
  public readonly type: TestHookType
  public readonly parent: Suite
  public readonly fn: HookFunction

  public constructor(type: TestHookType, parent: Suite, index: number, title: string | undefined | null, fn: any) {
    super(type, parent, index, title)
    this.fn = typeof fn === 'function' ? fn : () => fn
    ensureFunctionName(type, index, fn)
  }
}

export class Test extends TestEntity {
  public readonly type: 'test'
  public readonly parent: Suite
  public readonly fn: TestFunction

  public constructor(parent: Suite, index: number, title: string, fn: TestFunction) {
    super('test', parent, index, title, fn)
  }
}

export class Suite extends TestEntity {
  public readonly type: 'suite'
  public readonly fn: TestSuiteFunction

  public suites: Suite[] = []
  public tests: Test[] = []

  public beforeAllList: TestHook[] = []
  public afterAllList: TestHook[] = []
  public beforeEachList: TestHook[] = []
  public afterEachList: TestHook[] = []

  public constructor(parent: Suite | null, index: number, title: string, fn: TestSuiteFunction) {
    super('suite', parent, index, title, fn)
  }

  public addBeforeAll(title: string | null | undefined, fn?: HookFunction | Promise<T>): TestHook<T> {
    const hook = new TestHook('beforeAll', this, this.beforeAllList.length, title, fn)
    this.beforeAllList.push(hook)
    return hook
  }

  public addAfterAll(title: string | null | undefined, fn: HookFunction | Promise<any>): TestHook<T> {
    const hook = new TestHook('afterAll', this, this.afterAllList.length, title, fn)
    this.afterAllList.push()
    return hook
  }

  public addBeforeEach(title: string | null | undefined, fn: HookFunction | Promise<any>): TestHook<T> {
    const hook = new TestHook('beforeEach', this, this.beforeEachList.length, title, fn)
    this.beforeEachList.push(hook)
    return hook
  }

  public addAfterEach(title: string | null | undefined, fn: HookFunction | Promise<any>): TestHook<T> {
    const hook = new TestHook('afterEach', this, this.afterEachList.length, title, fn)
    this.afterEachList.push()
    return hook
  }

  public addTest(title: string, fn: TestFunction): Test {
    const test = new Test(this, this.tests.length, title, fn)
    this.tests.push(test)
    return test
  }

  public addSuite(title: string, fn: TestSuiteFunction): Suite {
    const suite = new Suite(this, this.suites.length, title, fn)
    this.suites.push(suite)
    return suite
  }
}

const createInterface = () => {
  const root: Suite = new Suite(null, -1, 'default', () => {})
}

class SuiteContainer {
  public readonly root: Suite
  public current: Suite

  public constructor(root: Suite) {
    this.root = root
    this.current = root
  }

  public describe(title: string, fn: TestSuiteFunction) {
    const previous = this.current
    const suite = this.current.addSuite(title, fn)
    this.current = suite
    try {
      fn()
    } finally {
      this.current = previous
    }
  }

  public it(title: string, fn: TestFunction) {
    this.current.addTest(title, fn)
  }

  public async run() {}
}

/*

export class Runnable {
  public readonly title: string

  public constructor(title: string) {
    this.title = title
  }

  public toString(): string {
    return `${this.constructor.name}: ${this.title}`
  }
}

export class TestEntity {
  public readonly title: string
  public readonly parent: TestSuite | null
  public readonly index: number
  public skip: boolean = false

  public get only() {
    return this._only
  }

  private _only: boolean = false

  public constructor(parent: TestSuite | null, title: string, index: number) {
    this.title = title
    this.parent = parent
    this.index = index
  }

  public markOnly(): boolean {
    if (this.only) {
      return false
    }
    this._only = true
    return true
  }

  public toString(): string {
    return `${this.constructor.name}: ${this.title}`
  }
}

export type TestHookType = 'beforeAll' | 'beforeEach' | 'afterAll' | 'afterEach'

export class TestHook {
  public readonly parent: TestSuite
  public readonly title: string
  public readonly type: TestHookType
  public readonly index: number
  public readonly fn: SetupFunction

  public constructor(
    parent: TestSuite,
    title: string | null | undefined,
    type: TestHookType,
    index: number,
    fn: SetupFunction | Promise<any>
  ) {
    this.parent = parent
    this.title = title || `${type}${index}`
    this.type = type
    this.index = index
    this.fn = typeof fn === 'function' ? fn : () => fn
    if (!this.fn.name) {
      Object.defineProperty(this.fn, 'name', {
        value: `${type}${index}`,
        configurable: true,
        enumerable: false,
        writable: false
      })
    }
  }
}

export class TestSuiteContext {
  public readonly suite: TestSuite

  public constructor(suite: TestSuite) {
    this.suite = suite
  }
}

export class TestContext extends TestSuiteContext {
  public readonly test: Test

  public constructor(test: Test) {
    super(test.parent)
    this.test = test
  }
}

export class TestSuite extends TestEntity {
  public suites: TestSuite[] = []
  public tests: Test[] = []

  public _beforeAll: TestHook[] = []
  public _beforeEach: TestHook[] = []
  public _afterEach: TestHook[] = []
  public _afterAll: TestHook[] = []

  public _onlyTests: Test[] = []
  public _onlySuites: TestSuite[] = []

  /** Determines whether a suite has an `only` test or suite as a descendant. 
  public hasOnly(): boolean {
    return this._onlyTests.length > 0 || this._onlySuites.length > 0 || this.suites.some((suite) => suite.hasOnly())
  }

  public markOnly(): boolean {
    if (!super.markOnly()) {
      return false
    }
    const parent = this.parent
    if (parent) {
      parent._onlySuites.push(this)
    }
    return true
  }

  public beforeAll(title: string | undefined, fn: SetupFunction | Promise<any>) {
    this._beforeAll.push(new TestHook(this, title, 'beforeAll', this._beforeAll.length, fn))
  }

  public beforeEach(title: string | undefined, fn: SetupFunction | Promise<any>) {
    this._beforeEach.push(new TestHook(this, title, 'beforeEach', this._beforeEach.length, fn))
  }

  public afterAll(title: string | undefined, fn: SetupFunction | Promise<any>) {
    this._afterAll.push(new TestHook(this, title, 'afterAll', this._afterAll.length, fn))
  }

  public afterEach(title: string | undefined, fn: SetupFunction | Promise<any>) {
    this._afterEach.push(new TestHook(this, title, 'afterEach', this._afterEach.length, fn))
  }

  public test(title: string, fn: TestFunction) {
    this.tests.push(new Test(this, title, this.tests.length, fn))
  }
}

export class Test extends TestEntity {
  public readonly parent: TestSuite
  public readonly fn: TestFunction

  public constructor(parent: TestSuite, title: string, fn: TestFunction) {
    super(parent, title)
    this.fn = fn
  }

  public markOnly() {
    if (!super.markOnly()) {
      return false
    }
    const parent = this.parent
    if (parent) {
      parent._onlyTests.push(this)
    }
    return true
  }
}


type CallbackAny = () => any

class Test {
  public parent: TestSuite
  public name: string
  public action: CallbackAny
  public skip: boolean = false
  public only: boolean = false

  public constructor(parent: TestSuite, name: string, action: CallbackAny) {
    this.parent = parent
    this.name = name
    this.action = action
  }

  public toString(): string {
    return `Test: ${this.name}`
  }
}

class TestSuite {
  public parent: TestSuite | null
  public name: string

  public beforeAlls: CallbackAny[] = []
  public afterAlls: CallbackAny[] = []

  public beforeEachs: CallbackAny[] = []
  public afterEachs: CallbackAny[] = []

  public action: CallbackAny

  public children: (TestSuite | Test)[] = []

  public constructor(parent: TestSuite | null, name: string, action: CallbackAny) {
    this.name = name
    this.action = action
  }

  public toString(): string {
    return `TestSuite: ${this.name}`
  }
}

const _rootSuite: TestSuite = new TestSuite(null, 'default', () => 12)

let _currentSuite: TestSuite = _rootSuite
let _onlyTests = 0

const describe = (name: string, action: CallbackAny) => {
  const suite = new TestSuite(_currentSuite, name, action)
  _currentSuite.children.push(suite)
  _currentSuite = suite
}

const describe_only = (name: string, action: CallbackAny) => {
  const suite = new TestSuite(_currentSuite, name, action)
  _currentSuite.children.push(suite)
  _currentSuite = suite
}

const describe_skip = (name: string, action: CallbackAny) => {
  const suite = new TestSuite(_currentSuite, name, action)
  _currentSuite.children.push(suite)
  _currentSuite = suite
}

const it = (name: string, action: CallbackAny) => {
  const test = new Test(_currentSuite, name, action)
  _currentSuite.children.push(test)
}

const it_only = (name: string, action: CallbackAny) => {
  const test = new Test(_currentSuite, name, action)
  test.only = true
  ++_onlyTests
  _currentSuite.children.push(test)
}

const it_skip = (name: string, action: CallbackAny) => {
  const test = new Test(_currentSuite, name, action)
  test.skip = true
  _currentSuite.children.push(test)
}

it.only = it_only
it.skip = it_skip
it_only.skip = it_skip
it_skip.only = it_only

module.exports = function (headline) {
  const suite = []
  const before = []
  const after = []
  const only = []

  function self(name, fn) {
    suite.push({ name, fn })
  }

  self.only = function (name, fn) {
    only.push({ name, fn })
  }

  self.before = function (fn) {
    before.push(fn)
  }
  self.after = function (fn) {
    after.push(fn)
  }
  self.skip = function (fn) {}

  self.run = async function () {
    const tests = only[0] ? only : suite

    rgb.cyan(`${headline} `)

    for (const test of tests) {
      try {
        for (const fn of before) {
          await fn()
        }
        await test.fn()
        rgb.gray('• ')
      } catch (e) {
        for (const fn of after) {
          await fn()
        }
        rgb.red(`\n\n! ${test.name} \n\n`)
        prettyError(e)
        return false
      }
    }

    for (const fn of after) {
      await fn()
    }
    rgb.greenln(`✓ ${tests.length}`)
    console.info('\n')
    return true
  }

  return self
}

function prettyError(e) {
  const msg = e.stack
  if (!msg) {
    return rgb.yellow(e)
  }

  const i = msg.indexOf('\n')
  rgb.yellowln(msg.slice(0, i))
  rgb.gray(msg.slice(i))
}
*/
