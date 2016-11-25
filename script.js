'use strict';

var Timescale = {
    DAY: 'Day',
    WEEK: 'Week',
    YEAR: 'Year',
    LIFETIME: 'Lifetime',
    values: ['Day', 'Week', 'Year', 'Lifetime']
};

var Utils = {
    centerOfLargestArea: function (stack, threshold) {
        var bestStart, bestEnd, bestArea, bestMidpoint,
            inArea = false, newStart, newArea = 0, newMidpoint = 0;
        
        for (var i = 0; i < stack.length; i++) {
            var distance = stack[i][1] - stack[i][0];
            
            if (!inArea && distance > threshold) {
                newStart = i;
                inArea = true;
            } else if (inArea && (distance <= threshold || i == stack.length - 1)) {
                if (bestStart === undefined || newArea > bestArea) {
                    bestStart = newStart;
                    bestEnd = i;
                    bestArea = newArea;
                    bestMidpoint = Math.floor(newMidpoint / newArea);

                    newArea = newMidpoint = 0;
                }
                inArea = false;
            }

            if (inArea) {
                newArea += distance;
                newMidpoint += i * distance;
            }
        }

        if (bestStart !== undefined) {
            return {
                x: bestMidpoint,
                y: (stack[bestMidpoint][0] + stack[bestMidpoint][1]) / 2
            };
        }
    },

    dateFromMinute: function (minute) {
        return d3.timeMinute.offset(new Date(2001, 6, 4, 4), minute);
    },

    dateFromDayOfWeek: function (dayOfWeek) {
        return d3.timeDay.offset(new Date(2001, 6, 1, 0), dayOfWeek);
    },

    dateFromDayOfYear: function (dayOfYear) {
        return d3.timeDay.offset(new Date(2001, 0, 1, 0), dayOfYear);
    },

    dateToIndex: function (timescale, time) {
        switch (timescale) {
            case Timescale.DAY:
                return d3.timeMinute.count(new Date(2001, 6, 4, 4), time);
            case Timescale.WEEK:
                return d3.timeDay.count(new Date(2001, 6, 1, 0), time);
            case Timescale.YEAR:
                return d3.timeDay.count(new Date(2001, 0, 1, 0), time);
            case Timescale.LIFETIME:
                return Math.floor(time - 15);
        }
    },

    extractData: function (data, timeMap) {
        var result = {},
            demographics = [],
            activities = [];

        for (var i = 0; i < data.columns.length; i++) {
            var parts = data.columns[i].split(':');
            if (parts.length < 2) continue;
            
            var demographic = parts[0],
                activity = parts[1];
            
            if (demographics.indexOf(demographic) == -1) {
                demographics.push(demographic);
                result[demographic] = [];
            }
            if (activities.indexOf(activity) == -1) activities.push(activity);
        }

        data.forEach(function (d, i) {
            demographics.forEach(function (demographic) {
                var row = {};
                activities.forEach(function (activity) {
                    var key = demographic + ':' + activity;
                    row[activity] = d[key];
                });
                row.date = timeMap(i);
                result[demographic].push(row);
            });
        });

        var ordering = [];
        var stack = d3.stack()
            .order(function (series) {
                ordering = d3.stackOrderDescending(series);
                return ordering;
            })
            .keys(activities)
        stack(result.all);
        stack.order(function (series) { return ordering; });

        demographics.forEach(function (demographic) {
            result[demographic] = stack(result[demographic]);
        });
        
        return result;
    },

    combineData: function (dayData, weekData, yearData, ageData) {
        var result = {};
        result[Timescale.DAY] = Utils.extractData(dayData, Utils.dateFromMinute);
        result[Timescale.WEEK] = Utils.extractData(weekData, Utils.dateFromDayOfWeek);
        result[Timescale.YEAR] = Utils.extractData(yearData, Utils.dateFromDayOfYear);
        result[Timescale.LIFETIME] = Utils.extractData(ageData, function (i) { return i + 15; });
        return result;
    }
};

var DotSlider = {
    create: function () {
        var result = Object.create(DotSlider);
        result._dispatch = d3.dispatch('change');
        return result;
    },

    domain: function (domain) {
        if (domain) {
            this._domain = domain;
            return this;
        } else {
            return this._domain;
        }
    },

    size: function (width, height) {
        if (width && height) {
            this._size = [width, height];
            return this;
        } else {
            return this._size;
        }
    },

    element: function (element) {
        if (element) {
            this._element = element;
            var padding = this._size[0] / this._domain.length,
                halfHeight = this._size[1] / 2;

            element.attr('class', 'dotslider')
                .append('line')
                .attr('class', 'axis')
                .attr('x1', 0)
                .attr('x2', this._size[0])
                .attr('y1', halfHeight)
                .attr('y2', halfHeight);

            var stops = element.selectAll('.stop')
                .data(this._domain)
                .enter()
                .append('g')
                .attr('class', 'stop')
                .attr('transform', function (d, i) {
                    return 'translate(' + (padding * (i + 1 / 2)) + ' ' + halfHeight + ')';
                });
            stops.append('circle')
                .attr('cx', 0)
                .attr('cy', 0)
                .attr('r', 5)
                .on('mouseover', function () {
                    d3.select(this)
                        .transition()
                        .attr('r', 7);
                })
                .on('mouseout', function () {
                    d3.select(this)
                        .transition()
                        .attr('r', 5);
                });
            stops.append('text')
                .attr('x', 0)
                .attr('y', -10)
                .text(function (d) { return d; });

            var mark = element.append('circle')
                .attr('class', 'mark')
                .attr('cx', padding / 2)
                .attr('cy', halfHeight)
                .attr('r', 5);

            var self = this;
            stops.on('click', function (d, i) {
                mark.transition()
                    .attr('cx', padding * (i + 1 / 2));
                self._dispatch.call('change', this, d, i);
            });
            return this;
        } else {
            return this._element;
        }
    },

    on: function (event, callback) {
        return this._dispatch.on(event, callback);
    }
};

var AreaChart = {
    create: function () {
        var result = Object.create(AreaChart);
        result._dispatch = d3.dispatch('cursorChanged', 'hoverActivityChanged', 'activityClicked');
        return result;
    },

    data: function (data) {
        if (data) {
            this._data = data;
            return this;
        } else {
            return this._data;
        }
    },

    timescale: function (timescale) {
        if (timescale) {
            var oldTimescale = this._timescale;
            this._timescale = timescale;

            if (this._element && oldTimescale !== timescale) {
                if (this._selectedActivity) {
                    this.resetYAxis();
                    this._selectedActivity = null;
                }
                this._x = this.generateX();
                this._xAxis = this.generateXAxis();
                var self = this;

                if (oldTimescale !== Timescale.LIFETIME && timescale !== Timescale.LIFETIME) {
                    this._xSelection.transition()
                        .duration(500)
                        .call(this._xAxis);
                } else {
                    this._xSelection.transition()
                        .style('opacity', 0)
                        .on('end', function () {
                            self._xSelection
                                .call(self._xAxis)
                                .transition()
                                .style('opacity', 1);
                        });
                }

                this._layerContainer.transition()
                    .style('opacity', 0)
                    .on('end', function () {
                        self._layers = self.generateStackedLayers();
                        self._layerContainer.transition()
                            .style('opacity', 1);
                    });
            }
            return this;
        } else {
            return this._timescale;
        }
    },

    selectedActivity: function (activity) {
        if (activity !== undefined) {
            var self = this;
            if (!activity) {
                this._y.domain([0, 1]);
                this._ySelection
                    .transition()
                    .duration(1000)
                    .call(this._yAxis);
                this._layers.filter(function (d) {
                        return d.key === self._selectedActivity;
                    })
                    .select('.area')
                    .transition()
                    .duration(1000)
                    .attr('d', this._singleArea)
                    .transition()
                    .duration(1000)
                    .attr('d', this._area);
                this._layers.filter(function (d) {
                        return d.key !== self._selectedActivity;
                    })
                    .transition()
                    .delay(1800)
                    .duration(500)
                    .style('opacity', 1)
                    .style('pointer-events', 'visiblePainted');
            } else if (this._selectedActivity !== activity) {
                this._layers.filter(function (d) {
                        return d.key !== activity;
                    })
                    .style('pointer-events', 'none')
                    .transition()
                    .duration(500)
                    .style('opacity', 0);
                this._layers.filter(function (d) {
                        return d.key === activity;
                    })
                    .select('.area')
                    .transition()
                    .delay(300)
                    .duration(1000)
                    .attr('d', this._singleArea)
                    .on('end', function () {
                        self.normalizeYAxis(d3.select(this).data()[0]);
                        d3.select(this)
                            .transition()
                            .duration(1000)
                            .attr('d', self._singleArea);
                    });
            }
            this._selectedActivity = activity;
            return this;
        } else {
            return this._selectedActivity;
        }
    },

    demographic: function (demographic) {
        if (demographic) {
            if (this._element && demographic !== this._demographic) {
                var self = this;
                var newLayers = this._layers.data(this._data[this._timescale][demographic]);
                if (!this._selectedActivity) {
                    newLayers
                        .select('.area')
                        .transition()
                        .duration(1000)
                        .attr('d', this._area);
                } else {
                    this.normalizeYAxis(this._data[this._timescale][demographic].filter(function (d) {
                        return d.key === self._selectedActivity;
                    })[0]);
                    newLayers.filter(function (d) {
                           return d.key === self._selectedActivity;
                        })
                        .select('.area')
                        .transition()
                        .duration(1000)
                        .attr('d', this._singleArea);

                    // Temporarily change the domain so that the other activities are in
                    // the right place when they fade back in
                    var oldDomain = this._y.domain();
                    this._y.domain([0, 1]);
                    newLayers.filter(function (d) {
                            return d.key !== self._selectedActivity;
                        })
                        .select('.area')
                        .attr('d', this._area);
                    this._y.domain(oldDomain);
                }
            }
            this._demographic = demographic;
            return this;
        } else {
            return this._demographic;
        }
    },

    size: function (width, height) {
        if (width && height) {
            this._size = [width, height];
            return this;
        } else {
            return this._size;
        }
    },

    element: function (element) {
        if (element) {
            this._element = element;
            this._innerSize = [this._size[0] - 50, this._size[1] - 20];
            this._chart = element.append('g')
                .attr('transform', 'translate(40 0)')
                .attr('class', 'areachart');

            // Add the layer container first so that the axes are always on top
            this._layerContainer = this._chart.append('g');

            this._y = d3.scaleLinear()
                .domain([0, 1])
                .range([this._innerSize[1], 0]);
            this._yAxis = d3.axisLeft(this._y)
                .tickFormat(function (d) {
                    return Math.abs(Math.floor(d * 100) - d * 100) < .001 ? d3.format('.0%')(d) : d3.format('.1%')(d);
                });
            this._ySelection = this._chart.append('g')
                .call(this._yAxis);
    
            this._x = this.generateX();
            this._xAxis = this.generateXAxis();
            this._xSelection = this._chart.append('g')
                .attr('transform', 'translate(0 ' + this._innerSize[1] + ')')
                .call(this._xAxis);
            
            this._z = d3.scaleOrdinal(d3.schemeCategory20);

            var self = this;

            this._area = d3.area()
                .x(function (d) { return self._x(d.data.date); })
                .y0(function (d) { return self._y(d[0]); })
                .y1(function (d) { return self._y(d[1]); });

            this._singleArea = d3.area()
                .x(function (d) { return self._x(d.data.date); })
                .y0(function (d) { return self._y(0); })
                .y1(function (d) { return self._y(d[1] - d[0]); });

            this._cursor = this._chart.append('line')
                .attr('class', 'cursor')
                .attr('y1', 0)
                .attr('y2', this._innerSize[1]);

            this._layerContainer
                .on('mousemove', function () {
                    var coords = d3.mouse(self._chart.node());
                    self._cursor
                        .attr('x1', coords[0])
                        .attr('x2', coords[0])
                        .style('display', 'inline');
                    var value = self._x.invert(coords[0]);
                    self._dispatch.call('cursorChanged', self, value);
                })
                .on('mouseout', function () {
                    self._cursor.style('display', 'none');
                    self._dispatch.call('cursorChanged', self, null);
                    self._dispatch.call('hoverActivityChanged', self, null);
                });

            this._layers = this.generateStackedLayers();

            return this;
        } else {
            return this._element;
        }
    },

    on: function (event, callback) {
        return this._dispatch.on(event, callback);
    },

    generateX: function () {
        var result;
        switch (this._timescale) {
            case Timescale.DAY:
                result = d3.scaleTime()
                    .domain([new Date(2001, 6, 4, 4), new Date(2001, 6, 5, 4)]);
                break;
            case Timescale.WEEK:
                result = d3.scaleTime()
                    .domain([new Date(2001, 6, 1, 0), new Date(2001, 6, 7, 0)]);
                break;
            case Timescale.YEAR:
                result = d3.scaleTime()
                    .domain([new Date(2001, 0, 1, 0), new Date(2001, 11, 31)]);
                break;
            case Timescale.LIFETIME:
                result = d3.scaleLinear().domain([15, 80]);
                break;
        }
        return result.range([0, this._innerSize[0]]);
    },

    generateXAxis: function () {
        var axis = d3.axisBottom(this._x);
        switch (this._timescale) {
            case Timescale.DAY:
                return axis.tickFormat(d3.timeFormat('%I %p'))
                    .ticks(d3.timeHour.every(2));
            case Timescale.WEEK:
                return axis.tickFormat(d3.timeFormat('%a'))
                    .ticks(d3.timeDay.every(1));
            case Timescale.YEAR:
                return axis.tickFormat(d3.timeFormat('%B'))
                    .ticks(d3.timeMonth.every(1));
            case Timescale.LIFETIME:
                return axis;
        }
    },

    generateStackedLayers: function () {
        var self = this;
        this._layerContainer.selectAll('.layer').remove();

        var layer = this._layerContainer.selectAll('.layer')
                .data(this._data[this._timescale][this._demographic])
                .enter()
                .append('g')
                .attr('class', 'layer');

        layer.append('path')
            .attr('class', 'area')
            .style('fill', function (d) { return self._z(d.key); })
            .attr('d', this._area);

        layer
            .on('mouseover', function (d) {
                self._dispatch.call('hoverActivityChanged', self, d.key);
            })
            .on('click', function (d) {
                self._dispatch.call('activityClicked', self, d.key);
            });

        return layer;
    },

    resetYAxis: function () {
        this._y.domain([0, 1]);
        this._ySelection.transition()
            .duration(500)
            .call(this._yAxis);
    },

    normalizeYAxis: function (data) {
        this._y.domain([0, d3.max(
            data,
            function (d) {
                return d[1] - d[0];
            }
        )]);
        this._ySelection
            .transition()
            .duration(1000)
            .call(this._yAxis);
    }
};

var HoverDetails = {
    create: function () {
        var result = Object.create(HoverDetails);
        result._dispatch = d3.dispatch();
        return result;
    },

    timescale: function (timescale) {
        if (timescale) {
            this._timescale = timescale;
            return this;
        } else {
            return this._timescale;
        }
    },

    time: function (time) {
        // Explicity check for undefined because a null time indicates
        // that we are averaging across the time period
        if (time !== undefined) {
            this._time = time;
            this._header.text(this.generateHeaderText());
            this.updateBreakdown();
            return this;
        } else {
            return this._time;
        }
    },

    demographic: function (demographic) {
        if (demographic) {
            this._demographic = demographic;
            if (this._element) {
                this._demographicHeader.text(this.generateDemographicText());
                this.updateBreakdown();
            }
            return this;
        } else {
            return this._demographic;
        }
    },

    focusActivity: function (activity) {
        // Explicity check for undefined, null indicates no focus
        if (activity !== undefined) {
            this._focusActivity = activity;
            this.updateBreakdown();
            return this;
        } else {
            return this._focusActivity;
        }
    },

    data: function (data) {
        if (data) {
            this._data = data;
            return this;
        } else {
            return this._data;
        }
    },

    size: function (width, height) {
        if (width && height) {
            this._size = [width, height];
            return this;
        } else {
            return this._size;
        }
    },

    element: function (element) {
        if (element) {
            this._element = element;
            element.attr('class', 'details');
            this._header = element.append('text')
                .attr('class', 'header')
                .attr('dy', '1em')
                .text(this.generateHeaderText());
            this._demographicHeader = element.append('text')
                .attr('class', 'header')
                .attr('dy', '1em')
                .attr('y', 20)
                .text(this.generateDemographicText());

            this._breakdownContainer = element.append('g')
                .attr('class', 'breakdown')
                .attr('transform', 'translate(0 60)');
            
            this.updateBreakdown();

            return this;
        } else {
            return this._element;
        }
    },

    generateHeaderText: function () {
        if (!this._time) {
            return "On an average day";
        }

        switch (this._timescale) {
            case Timescale.DAY:
                return 'At ' + d3.timeFormat('%I:%M %p')(this._time);
            case Timescale.WEEK:
                return 'On ' + d3.timeFormat('%A')(this._time);
            case Timescale.YEAR:
                return 'On ' + d3.timeFormat('%B %e')(this._time);
            case Timescale.LIFETIME:
                return 'At ' + Math.floor(this._time) + ' years old';
        }
    },

    generateDemographicText: function () {
        return {
            all: 'for an average American',
            male: 'for a male American',
            female: 'for a female American',
            'age_15-24': 'for an American aged 15-24',
            'age_25-64': 'for an American aged 25-64',
            'age_65-more': 'for an American aged 65+',
            white: 'for a white American',
            black: 'for a black American',
            hispanic: 'for a Hispanic American',
            employed: 'for an employed American',
            unemployed: 'for an unemployed American',
            'income_less-50': 'for an American making $0-$50k',
            'income_50-100': 'for an American making $50k-$100k',
            'income_100-more': 'for an American making $100k+'
        }[this._demographic];
    },

    updateBreakdown: function () {
        var self = this;
        this._breakdownContainer.selectAll('.measure').remove();

        var inputData = this._data[this._timescale][this._demographic];
        if (!self._time) {
            inputData = this._data[Timescale.DAY][this._demographic];
        }

        var data = inputData.map(function (d) {
            var value;
            if (!self._time) {
                value = d3.sum(d, function (e) { return e[1] - e[0]; });
                value /= 1440;
            } else {
                var index = Utils.dateToIndex(self._timescale, self._time);
                value = d[index][1] - d[index][0];
            }

            return {
                value: value,
                description: d.key 
            }
        });
        data = data.sort(function (a, b) {
            return b.value - a.value;
        });

        var measures = this._breakdownContainer.selectAll('.measure')
            .data(data);
        var newMeasures = measures.enter()
            .append('g')
            .attr('class', function (d) {
                return 'measure' + ((self._focusActivity === d.description) ? ' focused' : '');
            })
            .attr('transform', function (d, i) { return 'translate(0 ' + (i * 15) + ')' });
        newMeasures.append('text')
            .attr('class', 'value')
            .attr('x', 30)
            .text(function (d) { return d3.format('.1%')(d.value); });
        newMeasures.append('text')
            .attr('class', 'description')
            .attr('x', 40)
            .text(function (d) { return d.description; });
    }
};

var DemographicView = {
    create: function () {
        var result = Object.create(DemographicView);
        result._dispatch = d3.dispatch('demographicChanged');
        return result;
    },

    timescale: function (timescale) {
        if (timescale) {
            this._timescale = timescale;
            return this;
        } else {
            return this._timescale;
        }
    },

    time: function (time) {
        // Explicity check for undefined because a null time indicates
        // that we are averaging across the time period
        if (time !== undefined) {
            this._time = time;
            return this;
        } else {
            return this._time;
        }
    },

    demographic: function (demographic) {
        if (demographic) {
            this._demographic = demographic;
            if (this._element) {
                this._demographics.selectAll('.name')
                    .call(this.highlightSelectedDemographic(this));
            }
            return this;
        } else {
            return this._demographic;
        }
    },

    data: function (data) {
        if (data) {
            this._data = data;
            return this;
        } else {
            return this._data;
        }
    },

    size: function (width, height) {
        if (width && height) {
            this._size = [width, height];
            return this;
        } else {
            return this._size;
        }
    },

    element: function (element) {
        if (element) {
            this._element = element;
            var self = this;
            element.attr('class', 'demographics');
                // .append('rect')
                // .attr('width', this._size[0])
                // .attr('height', this._size[1])
                // .attr('fill', 'green');
            this._header = element.append('text')
                .attr('class', 'header')
                .attr('dy', '1em')
                .text('Explore demographics');
            this._demographics = element.selectAll('.demographic')
                .data(Object.keys(this._data[this._timescale]))
                .enter()
                .append('g')
                .attr('class', 'demographic')
                .attr('transform', function (d, i) { return 'translate(0 ' + (40 + i * 15) + ')'; });
            this._demographics.append('text')
                .attr('x', 100)
                .text(function (d) { return d; })
                .call(this.highlightSelectedDemographic(this));
            this._demographics
                .on('click', function (d) {
                    self._dispatch.call('demographicChanged', self, d);
                });
            return this;
        } else {
            return this._element;
        }
    },

    highlightSelectedDemographic: function (self) {
        return function (selection) {
            selection.attr('class', function (d) {
                return 'name' + (self._demographic === d ? ' selected' : '');
            });
        }
    },

    on: function (event, callback) {
        return this._dispatch.on(event, callback);
    }
};

function handleData (svg) {
    return function (error, dayData, weekData, yearData, ageData) {
        if (error) {
            console.error(error);
            return;
        }

        var data = Utils.combineData(dayData, weekData, yearData, ageData);

        var slider = DotSlider.create()
            .domain(Timescale.values)
            .size(960, 50)
            .element(svg.append('g'));

        var area = AreaChart.create()
            .data(data)
            .timescale(Timescale.DAY)
            .demographic('all')
            .size(700, 450)
            .element(
                svg.append('g')
                    .attr('transform', 'translate(0 50)')
            );

        var details = HoverDetails.create()
            .data(data)
            .demographic('all')
            .timescale(Timescale.DAY)
            .size(250, 450)
            .element(
                svg.append('g')
                    .attr('transform', 'translate(710 50)')
            );

        var demographics = DemographicView.create()
            .data(data)
            .timescale(Timescale.DAY)
            .demographic('all')
            .size(700, 290)
            .element(
                svg.append('g')
                    .attr('transform', 'translate(0 510)')
            );

        slider.on('change', function (d) {
            area.timescale(d);
            details.timescale(d);
        });

        area
            .on('cursorChanged', function (value) {
                details.time(value);
            })
            .on('hoverActivityChanged', function (activity) {
                details.focusActivity(activity);
            })
            .on('activityClicked', function (activity) {
                if (area.selectedActivity()) {
                    area.selectedActivity(null);
                } else {
                    area.selectedActivity(activity);
                }
            });

        demographics.on('demographicChanged', function (demographic) {
            area.demographic(demographic);
            details.demographic(demographic);
            demographics.demographic(demographic);
        });
    }
}

function run () {
    var svg = d3.select('#canvas')
        .append('svg')
        .attr('width', 960 + 30)
        .attr('height', 800);

    d3.queue()
        .defer(d3.csv, 'day.csv')
        .defer(d3.csv, 'week.csv')
        .defer(d3.csv, 'year.csv')
        .defer(d3.csv, 'age.csv')
        .await(handleData(svg));
}

document.addEventListener('DOMContentLoaded', run);
