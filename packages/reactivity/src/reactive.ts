import { isObject, toRawType } from '@vue/shared'
import {
  mutableHandlers,
  readonlyHandlers,
  shallowReadonlyHandlers
} from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers
} from './collectionHandlers'
import { UnwrapRef, Ref } from './ref'
import { makeMap } from '@vue/shared'

// WeakMaps that store {raw <-> observed} pairs.
const rawToReactive = new WeakMap<any, any>() // 原始数据 和 响应式数据的映射
const reactiveToRaw = new WeakMap<any, any>() // 响应式数据 和 原始数据的映射
const rawToReadonly = new WeakMap<any, any>() // 原始数据 和 只读的映射
const readonlyToRaw = new WeakMap<any, any>() // 只读数据 和 原始数据的映射

// WeakSets for values that are marked readonly or non-reactive during
// observable creation.
const readonlyValues = new WeakSet<any>()
const nonReactiveValues = new WeakSet<any>() // nonReactiveValues 存储非响应式对象, 如: DOM

const collectionTypes = new Set<Function>([Set, Map, WeakMap, WeakSet])
const isObservableType = /*#__PURE__*/ makeMap(
  'Object,Array,Map,Set,WeakMap,WeakSet'
)

//  可以被观察的值同时具备的条件:
// 非Vue对象 && 非虚拟节点 && 在可被观察的类型(Object,Array,Map,Set,WeakMap,WeakSet)中 && 不是非响应式
// toRawType: 获取原生的数据类型
// makeMap: 过滤类型, 返回筛选函数
const canObserve = (value: any): boolean => {
  return (
    !value._isVue &&
    !value._isVNode &&
    isObservableType(toRawType(value)) &&
    !nonReactiveValues.has(value)
  )
}

// only unwrap nested ref 只自动展开嵌套ref
type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>

export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  // 若target在只读=>原生数据映射中, 直接返回
  if (readonlyToRaw.has(target)) {
    return target
  }
  // target is explicitly marked as readonly by user
  // target 被用户标记为只读, 按只读类别处理
  if (readonlyValues.has(target)) {
    return readonly(target)
  }
  return createReactiveObject(
    target, // 需要被代理的目标对象
    rawToReactive, // 原生=>响应式数据的映射(weakMap)
    reactiveToRaw, // 响应式=>原生数据的映射(weakMap)
    mutableHandlers, // 可变数据(Object,Array)的处理回调
    mutableCollectionHandlers // 可变集合(Map,Set,WeakMap,WeakSet)的处理回调
  )
}

export function readonly<T extends object>(
  target: T
): Readonly<UnwrapNestedRefs<T>> {
  // value is a mutable observable, retrieve its original and return
  // a readonly version.
  if (reactiveToRaw.has(target)) {
    // target is reactive
    target = reactiveToRaw.get(target)
  }
  return createReactiveObject(
    target,
    rawToReadonly,
    readonlyToRaw,
    readonlyHandlers,
    readonlyCollectionHandlers
  )
}

// @internal
// Return a reactive-copy of the original object, where only the root level
// properties are readonly, and does not recursively convert returned properties.
// This is used for creating the props proxy object for stateful components.
export function shallowReadonly<T extends object>(
  target: T
): Readonly<{ [K in keyof T]: UnwrapNestedRefs<T[K]> }> {
  return createReactiveObject(
    target,
    rawToReadonly,
    readonlyToRaw,
    shallowReadonlyHandlers,
    readonlyCollectionHandlers
  )
}

// 创建响应式对象
function createReactiveObject(
  target: unknown,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  // 情形1. target非对象直接返回
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // target already has corresponding Proxy
  // 情形2. target已经有对应的Proxy代理(已经被代理过)
  let observed = toProxy.get(target)
  if (observed !== void 0) {
    return observed
  }
  // target is already a Proxy
  // 情形3. target本身是一个Proxy对象, 直接返回
  if (toRaw.has(target)) {
    return target
  }
  // only a whitelist of value types can be observed.
  // 情形4. 不在被观察的白名单中
  if (!canObserve(target)) {
    return target
  }
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers
  observed = new Proxy(target, handlers)
  toProxy.set(target, observed) // 存储原生=>响应式数据映射表, 联系情形2, 可知目的: 防止reactive已经被reactive的值, 导致多次Proxy
  toRaw.set(observed, target) // 存储响应式=>原生数据映射表, 联系情形3, 可知目的: 防止reactive已经被reactive的值, 导致多次Proxy
  return observed
}

export function isReactive(value: unknown): boolean {
  return reactiveToRaw.has(value) || readonlyToRaw.has(value)
}

export function isReadonly(value: unknown): boolean {
  return readonlyToRaw.has(value)
}

export function toRaw<T>(observed: T): T {
  return reactiveToRaw.get(observed) || readonlyToRaw.get(observed) || observed
}

export function markReadonly<T>(value: T): T {
  readonlyValues.add(value)
  return value
}

export function markNonReactive<T>(value: T): T {
  nonReactiveValues.add(value)
  return value
}
