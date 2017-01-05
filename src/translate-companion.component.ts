import {TranslateCompanionService, TranslateCompanionConfig} from "./translate-companion.service";
import {OnInit, ElementRef, ViewChild, Component} from "@angular/core";
import {Observable, BehaviorSubject} from "rxjs";
import {Translation} from "./translation";
@Component({
    selector: 'mk-translate-companion',
    template: `
        <div class="helper" *ngIf="!config?.disabled">
          <form>
            <div class="helper-block info">
              <span>current lang = {{translateCompanion.getCurrentLang()}}</span>
            </div>
            
            <div class="helper-block translations">        
                <div *ngFor="let trans of translations$ | async">
                    <label for="{{trans.key}}">{{trans.key}}</label>
                    <textarea name="{{trans.key}}" [(ngModel)]="trans.value"></textarea>
                </div>
            </div>
            
            <div class="helper-block buttons">
              <button (click)="toggleKeysVisible()">
                  <span *ngIf="(keysVisible$ | async) === true">hide keys</span>
                  <span *ngIf="(keysVisible$ | async) === false">show keys</span>
              </button>
              <input #cb [ngModel]="filterOn$ | async" name="filterOn" type="checkbox" 
                (ngModelChange)="toggleFilter(cb.checked)"> not translated only {{filterOn}}
              <button (click)="reload()">reload</button>
              <button (click)="save()">save</button>
              <button (click)="download()">download</button>
              <a #downloadEl id="downloadLink">download</a>
            </div>
            
          </form>
        </div>
    `,
    styles: [
        `
      .helper {
        background-color: rgba(0, 109, 146, 0.38);
        padding: 10px;
      }
      
      .info {
        margin-bottom: 20px;
      }
      
      .translations {
        margin-bottom: 40px;
      }
      
      .translations label {
        margin-bottom: 2px;
      }
      
      .translations input, .translations textarea {
        width: 100%;
      }
      
      .translations div {
        margin-bottom: 5px;
      }
      
      #downloadLink {
        visibility: hidden;
      }
    `
    ]
})
export class TranslateCompanionComponent implements OnInit {

    keysVisible$: Observable<boolean>;
    private _filterOn: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
    filterOn$: Observable<boolean> = this._filterOn.asObservable();
    translations$: Observable<Translation[]>;

    @ViewChild("downloadEl") downloadEl: ElementRef;

    constructor(private translateCompanion: TranslateCompanionService, private config: TranslateCompanionConfig) {
    }

    ngOnInit() {
        this.keysVisible$ = this.translateCompanion.keysVisible$;
        this.translations$ = this.translateCompanion.translations$
            .combineLatest(this.filterOn$)
            .map(([translations, filterOn]) => {
                if (filterOn) {
                    return translations.filter(tr => {
                        return tr.key === tr.value;
                    });
                } else {
                    return translations;
                }
            })
            .map(translations => translations.sort((tr1, tr2) => tr1.key.localeCompare(tr2.key)));
    }

    reload() {
        this.translateCompanion.reload();
    }

    toggleKeysVisible() {
        this.translateCompanion.toggleKeysVisible();
    }

    toggleFilter(filterOn) {
        this._filterOn.next(filterOn);
    }

    save() {
        this.translateCompanion.save()
            .subscribe();
    }

    download() {
        this.translateCompanion.getTranslationsAsJson(this.translateCompanion.getCurrentLang()).subscribe(translations => {
            let nativeElement = this.downloadEl.nativeElement;
            nativeElement.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(translations));
            nativeElement.download = `${this.translateCompanion.getCurrentLang()}.json`;
            nativeElement.click();
        });
    }


}
