import * as Backbone from 'backbone';
import * as _ from 'lodash';
import * as $ from 'jquery';

import { Dictionary } from '../data/model';

import { ClassTreeElement } from '../diagram/model';
import DiagramView from '../diagram/view';

// bundling jstree to solve issues with multiple jquery packages,
// when jstree sets itself as plugin to wrong version of jquery
const jstreeJQuery = require<JQueryStatic>('exports?require("jquery")!jstree');
require('jstree/dist/themes/default/style.css');

interface TreeClassModel extends ClassTreeElement {
    text?: string;
    type?: string;
}

export interface ClassTreeOptions extends Backbone.ViewOptions<Backbone.Model> {
    view: DiagramView;
}

const CLASS_NAME = 'ontodia-class-tree';

/**
 * Events:
 *     action:classSelected(classId: string)
 */
export class ClassTree extends Backbone.View<Backbone.Model> {
    private filter: JQuery = null;
    private tree: JQuery = null;
    private rest: JQuery = null;
    private view: DiagramView;

    constructor(options: ClassTreeOptions) {
        super(_.extend({className: CLASS_NAME}, options));
        let selfLink = this;
        this.$el.addClass(_.result(this, 'className') as string);
        this.view = options.view;
        this.model.set('language', this.view.getLanguage(), {silent: true});
        this.listenTo(this.view, 'change:language', this.onLanguageChanged);

        this.rest = $(`<div class="${CLASS_NAME}__rest"></div>`);
        this.tree = $(`<div class="${CLASS_NAME}__tree"></div>`).appendTo(this.rest);

        // Input for search in classTree
        this.filter = $(`<div class="${CLASS_NAME}__filter"></div>`);

        let innerDiv = $(`<div class="${CLASS_NAME}__filter-group"></div>`).appendTo(this.filter);
        let searchInput =
            $('<input type="text" class="search-input form-control" placeholder="Search for..."/>')
            .appendTo(innerDiv);

        this.listenTo(this.view.model, 'state:dataLoaded', () => {
            let model = this.view.model;
            let tree = model.classTree;
            const iconMap = this.updateClassLabels(tree);
            this.setUrls(tree);
            this.getJSTree().jstree({
                'plugins': ['types', 'sort', 'search'],
                'core': {'data': tree},
                'types': iconMap,
                'sort': (firstClassId: string, secondClassId: string) => {
                    return (model.getClassesById(firstClassId).model as TreeClassModel).text.localeCompare(
                        (model.getClassesById(secondClassId).model as TreeClassModel).text);
                },
                'search': {
                    'case_insensitive': true,
                    'show_only_matches': true,
                },
            });

            this.getJSTree().on('select_node.jstree', (e, data) => {
                this.trigger('action:classSelected', data.selected[0]);
            });

            searchInput.keyup(function (this: HTMLInputElement) {
                let searchString = $(this).val();
                selfLink.getJSTree().jstree('search', searchString);
            });
        });
    }

    private updateClassLabels(roots: ClassTreeElement[]): Dictionary<{icon: string}> {
        const iconMap: Dictionary<{ icon: string }> = {
            'default': {icon: 'default-tree-icon'},
            'has-not-children': {icon: 'default-tree-icon'},
            'has-children': {icon: 'parent-tree-icon'},
        };

        if (roots) {
            for (let i = 0; i < roots.length; i++) {
                let element = roots[i] as TreeClassModel;
                const icon = this.view.getTypeStyle([element.id]).icon;
                let iconId: string;
                if (icon) {
                    iconId = _.uniqueId('iconId');
                    iconMap[iconId] = {icon: icon + ' ontodia-tree-icon'};
                }

                if ('children' in element) {
                    const innerMap = this.updateClassLabels(element.children);
                    Object.keys(innerMap).forEach(key => {
                        iconMap[key] = innerMap[key];
                    });

                    if (element.children.length !== 0) {
                        element.type = (iconId ? iconId : 'has-children');
                    } else {
                        element.type = (iconId ? iconId : 'has-not-children');
                    }
                } else {
                    element.type = (iconId ? iconId : 'has-not-children');
                }

                element.text = this.view.getLocalizedText(element.label.values).text + (!isNaN(element.count) ? ' (' + element.count + ')' : '');
            }
        }

        return iconMap;
    }

    private getJSTree() {
        return jstreeJQuery(this.tree.get(0));
    }

    private onLanguageChanged() {
        // this.updateClassLabels(this.view.model.classTree);
        let jsTree = this.getJSTree().jstree(true);
        (jsTree as any).settings.core.data = this.view.model.classTree;
        jsTree.refresh(/* do not show loading indicator */ true, undefined);
    }

    private setUrls(tree: ClassTreeElement[]) {
        tree.forEach(el => {
          this.setUrlsRec(el);
        });
    }
    private setUrlsRec(root: ClassTreeElement) {
        root.a_attr = { href: '#' + root.id };
        root.children.forEach(el => this.setUrlsRec(el));
    }

    render(): ClassTree {
        this.filter.appendTo(this.$el);
        this.rest.appendTo(this.$el);
        return this;
    }
}

export default ClassTree;
