(function () {
    'use strict';

    const ORDERS_TYPES = {
        asks: 'asks',
        bids: 'bids'
    };
    const SERIES_SETTINGS = {
        asks: {
            dataset: ORDERS_TYPES.asks,
            key: 'amount',
            label: 'Asks',
            color: '#f27057',
            type: ['line', 'line', 'area']
        },
        bids: {
            dataset: ORDERS_TYPES.bids,
            key: 'amount',
            label: 'Bids',
            color: '#2b9f72',
            type: ['line', 'line', 'area']
        }
    };
    const ORDER_LIST_STUB = [{ amount: 0, price: 0 }];
    const THRESHOLD_VALUES = {
        asks: 2,
        bids: 2
    };

    /**
     * @param Base
     * @param utils
     * @param {Waves} waves
     * @param {function} createPoll
     * @return {TradeGraph}
     */
    const controller = function (Base, utils, waves, createPoll) {

        class TradeGraph extends Base {

            constructor() {
                super();

                /**
                 * @type {{amount: string, price: string}}
                 * @private
                 */
                this._assetIdPair = null;

                /**
                 * @type {number}
                 * @private
                 */
                this._chartCropRate = null;

                /**
                 * @type {boolean}
                 * @private
                 */
                this._canShowGraph = false;

                this.options = {
                    margin: {
                        top: 10,
                        left: 70,
                        right: 70
                    },
                    grid: {
                        x: false,
                        y: false
                    },
                    series: [
                        SERIES_SETTINGS.asks,
                        SERIES_SETTINGS.bids
                    ],
                    axes: {
                        x: { key: 'price', type: 'linear', ticks: 2 },
                        y: { key: 'amount', ticks: 4 }
                    }
                };

                this.data = {
                    asks: ORDER_LIST_STUB,
                    bids: ORDER_LIST_STUB
                };

                this.syncSettings({
                    _assetIdPair: 'dex.assetIdPair',
                    _chartCropRate: 'dex.chartCropRate'
                });

                this.observe(['_assetIdPair', '_chartCropRate'], this._onChangeAssets);

                /**
                 * @type {Poll}
                 * @private
                 */
                this._poll = createPoll(this, this._getOrderBook, this._setOrderBook, 1000);
            }

            /**
             * @returns {boolean}
             */
            shouldShowGraph() {
                return this._canShowGraph;
            }

            /**
             * @returns {boolean}
             */
            shouldShowStub() {
                return !this.shouldShowGraph();
            }

            _onChangeAssets(noRestart) {
                if (!noRestart) {
                    this._poll.restart();
                }
            }

            _getOrderBook() {
                return (
                    waves.matcher
                        .getOrderBook(this._assetIdPair.amount, this._assetIdPair.price)
                        .then((orderBook) => this._cutOffOutlyingOrdersIfNecessary(orderBook))
                        .then((orderBook) => this._updateGraphAccordingToOrderBook(orderBook))
                        .then((orderBook) => this._buildCumulativeOrderBook(orderBook))
                );
            }

            _setOrderBook({ asks, bids }) {
                this.data.asks = asks;
                this.data.bids = bids;
            }

            _cutOffOutlyingOrdersIfNecessary(orderBook) {
                if (this._areEnoughOrders(orderBook)) {
                    return this._cutOffOutlyingOrders(orderBook);
                }

                return orderBook;
            }

            _cutOffOutlyingOrders({ asks, bids }) {
                const spreadPrice = new BigNumber(asks[0].price)
                    .sub(bids[0].price)
                    .div(2)
                    .add(bids[0].price);
                const delta = spreadPrice.mul(this._chartCropRate).div(2);
                const max = spreadPrice.add(delta);
                const min = BigNumber.max(0, spreadPrice.sub(delta));

                return {
                    asks: asks.filter((ask) => new BigNumber(ask.price).lte(max)),
                    bids: bids.filter((bid) => new BigNumber(bid.price).gte(min))
                };
            }

            _updateGraphAccordingToOrderBook(orderBook) {
                if (this._areSomeOrdersToShow(orderBook)) {
                    this._prepareGraphForOrders(orderBook);
                } else {
                    this._hideGraphAndShowStub();
                }

                return orderBook;
            }

            _areSomeOrdersToShow(orderBook) {
                return !(
                    this._isLackOfAsks(orderBook) &&
                    this._isLackOfBids(orderBook)
                );
            }

            _prepareGraphForOrders(orderBook) {
                this._showGraphAndHideStub();

                if (this._areEnoughOrders(orderBook)) {
                    this._setGraphToShowAsksAndBids();
                }

                if (this._isLackOfAsks(orderBook)) {
                    this._setGraphToShowOnly(ORDERS_TYPES.bids);
                }

                if (this._isLackOfBids(orderBook)) {
                    this._setGraphToShowOnly(ORDERS_TYPES.asks);
                }
            }

            _showGraphAndHideStub() {
                this._canShowGraph = true;
            }

            _areEnoughOrders(orderBook) {
                return !(
                    this._isLackOfAsks(orderBook) ||
                    this._isLackOfBids(orderBook)
                );
            }

            _isLackOfAsks(orderBook) {
                return this._isLackOf(orderBook, ORDERS_TYPES.asks);
            }

            _isLackOfBids(orderBook) {
                return this._isLackOf(orderBook, ORDERS_TYPES.bids);
            }

            _isLackOf(orderBook, ordersType) {
                return orderBook[ordersType].length < THRESHOLD_VALUES[ordersType];
            }

            _setGraphToShowAsksAndBids() {
                this._updateGraphSeriesOptions([
                    SERIES_SETTINGS.asks,
                    SERIES_SETTINGS.bids
                ]);
            }

            _setGraphToShowOnly(orderType) {
                this._updateGraphSeriesOptions([
                    SERIES_SETTINGS[orderType]
                ]);
            }

            _hideGraphAndShowStub() {
                this._updateGraphSeriesOptions([]);
                this._canShowGraph = false;
            }

            _updateGraphSeriesOptions(seriesOptions) {
                this.options.series = seriesOptions;
            }

            _buildCumulativeOrderBook({ asks, bids }) {
                return {
                    asks: this._buildCumulativeOrderList(asks),
                    bids: this._buildCumulativeOrderList(bids)
                };
            }

            _buildCumulativeOrderList(list) {
                let amount = 0;
                return list.reduce((result, item) => {
                    amount += Number(item.amount);
                    result.push({
                        amount,
                        price: Number(item.price)
                    });
                    return result;
                }, []);
            }

        }

        return new TradeGraph();
    };

    controller.$inject = ['Base', 'utils', 'waves', 'createPoll'];

    angular.module('app.dex')
        .component('wDexTradeGraph', {
            templateUrl: 'modules/dex/directives/tradeGraph/tradeGraph.html',
            controller
        });
})();
