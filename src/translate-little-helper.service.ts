import {Injectable, EventEmitter} from "@angular/core";
import {BehaviorSubject, Observable} from "rxjs";
import {TranslateService, LangChangeEvent} from "ng2-translate";
import {Router, NavigationStart} from "@angular/router";
import {Translation} from "./translation";

export class TranslateLittleHelperConfig {
  disabled?: boolean = false;
  nesting?: number = 1;
}

@Injectable()
export class TranslateLittleHelperService {

  private _translation$: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  private _keysVisible$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  keysVisible$: Observable<boolean> = this._keysVisible$.asObservable();

  private _translations$: BehaviorSubject<Translation[]> = new BehaviorSubject<Translation[]>([]);
  translations$: Observable<Translation[]> = this._translations$.asObservable();

  private saved: any = {};

  onSave: EventEmitter<any> = new EventEmitter<any>();

  constructor(private translate: TranslateService,
              private config:TranslateLittleHelperConfig,
              router?: Router) {

    if (config.disabled) {
      return;
    }

    this.overrideTranslateServiceMethods();

    let lang$ = translate.onLangChange.asObservable()
      .map((evt: LangChangeEvent) => evt.lang)
      .filter(evt => evt !== null)
      .distinctUntilChanged();

    let changes$: Observable<any>;
    if (router) {
      let route$ = router.events.filter(event => event instanceof NavigationStart);
      changes$ = Observable.merge(route$, lang$);
    }
    else {
      changes$ = lang$
    }

    changes$
      .do(() => this._translation$.next(null))
      .switchMap(() => {
        return this._translation$.asObservable()
            .filter(tr => tr !== null && tr.lang === this.getCurrentLang())
            .scan((acc, translation) => [...acc, translation], [])
      })
      .map(trs => {
        return unique(trs).sort((left, right) => (<string>left.key).localeCompare(right.key));
      })
      .subscribe((trs: Translation[]) => {
        this._translations$.next(trs);
      });

  }

  private overrideTranslateServiceMethods() {
    let originalGet = this.translate.get.bind(this.translate);
    let originalInstant = this.translate.instant.bind(this.translate);
    let originalGetParsedResult = this.translate.getParsedResult.bind(this.translate);

    // this.translate.get = (key: string|Array<string>, interpolateParams?: Object): Observable<string|any> => {
    this.translate.get = (key: any, interpolateParams?: Object): Observable<string|any> => {
      return originalGet(key, interpolateParams).combineLatest(this.keysVisible$)
        .map(([translation, keysVisible]) => {
          let _key: any = key;
          let _saved = this.saved[this.translate.currentLang] ? this.saved[this.translate.currentLang] : {};
          // return [_saved[_key] ? _saved[_key] : translation, keysVisible];
          return [_saved[_key] ? originalGetParsedResult({[key] : _saved[key]}, key, interpolateParams) : translation, keysVisible];
        })
        .do(([translation, keysVisible]) => {
          this._translation$.next({key, lang: this.translate.currentLang, value: translation});
        })
        .map(([translation, keysVisible]) => {
          return keysVisible ? key : translation
        });
    };

    // this.translate.instant = (key: string | Array<string>, interpolateParams?: Object): string|any => {
    this.translate.instant = (key: any, interpolateParams?: Object): string|any => {
      let _key: any = key;
      let _saved = this.saved[this.translate.currentLang] ? this.saved[this.translate.currentLang] : {};
      // let translation = _saved[_key] ? _saved[_key] : originalInstant(key, interpolateParams);
      //note originalGetParsedResult
      let translation = _saved[key] ? originalGetParsedResult({[key] : _saved[key]}, key, interpolateParams) : originalInstant(key, interpolateParams);
      this._translation$.next({key, lang: this.translate.currentLang, value: translation});
      return this._keysVisible$.getValue() ? key : translation;
    };

    this.translate.getParsedResult = (translations: any, key: any, interpolateParams?: Object): any => {
      let _saved = this.saved[this.translate.currentLang] ? this.saved[this.translate.currentLang] : {};
      // let translation = _saved[key] ? _saved[key] : originalGetParsedResult(translations, key, interpolateParams);
      let translation = _saved[key] ? originalGetParsedResult({[key] : _saved[key]}, key, interpolateParams) : originalGetParsedResult(translations, key, interpolateParams);
      let unresolvedTranslation = translation;
      if (interpolateParams) {
        unresolvedTranslation = _saved[key] ? _saved[key] : originalGetParsedResult(translations, key);
      }
      this._translation$.next({key, lang: this.translate.currentLang, value: unresolvedTranslation});
      return this._keysVisible$.getValue() ? key : translation;
    };
  }

  getCurrentLang() {
    return this.translate.currentLang;
  }

  toggleKeysVisible() {
    this._keysVisible$.next(!this._keysVisible$.getValue());
  }

  reload() {
    setTimeout(() => {
      this.translate.use(this.translate.currentLang);
    }, 100);
  }

  save() {
    return this.translations$
      .take(1)
      .map(trs => trs.filter(tr => tr.key !== tr.value))
      .map(trs => trs.reduce((res, tr) => {
        return Object.assign(res, {[tr.key]: tr.value});
      }, {}))
      .do(res => {
        let lang = this.translate.currentLang;
        if (!this.saved[lang]) {
          this.saved[lang] = {};
        }
        this.saved[lang] = Object.assign({}, this.saved[lang], res);

        this.translate.setTranslation(lang, this.saved[lang], true);
        this.onSave.emit(res);
      })
  }

  getTranslationsAsJson(lang: string) {

    let trs = [];
    let _saved = this.saved[lang];
    if (_saved) {
      for (let prop in _saved) {
        if (_saved.hasOwnProperty(prop)) {
          trs.push(keyToJson(prop, _saved[prop], this.config.nesting));
        }
      }
    }

    return this.translate.getTranslation(lang)
      .zip(Observable.of(trs))
      .map(([trs, nested])=> {
        for (let tr of nested) {
          trs = mergeDeep(trs, tr);
        }
        return trs;
      });
  }
}

//cf. http://stackoverflow.com/questions/15125920/how-to-get-distinct-values-from-an-array-of-objects-in-javascript
const unique = (arr: any[]): any[] => {
  var unique = {};
  var distinct = [];
  for (var i in arr) {
    if (typeof(unique[arr[i].key]) == "undefined") {
      distinct.push(arr[i]);
    }
    unique[arr[i].key] = 0;
  }
  return distinct;
}

function keyToJson(keys: string, val: string, levelsOfNesting:number = null) {

  if (!levelsOfNesting || levelsOfNesting <= 1) {
    return {[keys] : val};
  }

  let split = keys.split('.');

  if (split.length > levelsOfNesting) {
    let head = split.slice(0, 1);
    let tail = split.slice(1).join('.');
    split = head.concat(tail);
  }

  let result = {};
  let current = result;
  split.forEach((key, index)=> {
    if (index === split.length - 1) {
      current[key] = val;
    }
    else {
      current[key] = {};
      current = current[key];
    }
  });
  return result;
}

// http://stackoverflow.com/questions/27936772/how-to-deep-merge-instead-of-shallow-merge
/**
 * Simple is object check.
 * @param item
 * @returns {boolean}
 */
export function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge two objects.
 * @param target
 * @param source
 */
export function mergeDeep(target, source) {
  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, {[key]: {}});
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, {[key]: source[key]});
      }
    }
  }
  return target;
}
