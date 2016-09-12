import * as Backbone from 'backbone';
import * as _ from 'lodash';
import * as $ from 'jquery';

export interface CollectionViewOptions<TModel extends Backbone.Model> extends Backbone.ViewOptions<TModel> {
    childView: any; /* typeof Backbone.View<TModel> */
    childOptions: Backbone.ViewOptions<TModel>;
}

export class CollectionView<TModel extends Backbone.Model> extends Backbone.View<TModel> {
    private childView: any; /* typeof Backbone.View<TModel> */
    private childOptions: Backbone.ViewOptions<TModel>;
    private childViews: Backbone.View<TModel>[];
    private isRendered = false;

    constructor(options: CollectionViewOptions<TModel>) {
        super(options);
        this.onAdd = this.onAdd.bind(this);
        this.onRemove = this.onRemove.bind(this);
        this.onReset = this.onReset.bind(this);

        if (!options.childView) { throw new Error('No child view constructor provided'); }
        if (!options.childOptions) { throw new Error('No child view options provided'); }

        this.childView = options.childView;
        this.childOptions = options.childOptions;
        this.childViews = [];

        this.collection.each(this.onAdd);
        this.collection.bind('add', this.onAdd);
        this.collection.bind('remove', this.onRemove);
        this.collection.bind('reset', this.onReset);
    }

    private onAdd(model: TModel) {
        const childView: Backbone.View<TModel> = new this.childView(
            _.extend({ model: model }, this.childOptions));

        this.childViews.push(childView);

        if (this.isRendered) {
            $(this.el).append(childView.render().el);
        }
    }

    private onRemove(model: TModel) {
        const viewToRemove = _.filter(this.childViews, cv => cv.model === model)[0];
        if (viewToRemove) {
            this.childViews = _.without(this.childViews, viewToRemove);
            viewToRemove.remove();
        }
    }

    private onReset() {
        // 'reset' event on collection do not trigger
        // 'add' and 'remove' events on models
        removeAllViews(this.childViews);
        this.collection.each(this.onAdd);
    }

    public render(): CollectionView<TModel> {
        this.isRendered = true;
        $(this.el).empty();
        _.each(this.childViews, cv => $(this.el).append(cv.render().el));
        return this;
    }
}

export default CollectionView;

export function removeAllViews<TModel extends Backbone.Model>(views: Backbone.View<TModel>[]) {
    _.each(views, view => { view.remove(); });
    views.length = 0;
}
