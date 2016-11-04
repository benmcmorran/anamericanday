import sys
import json
import csv

def minutes(time):
    result = int(time[0:2]) * 60 + int(time[3:5]) - 4 * 60
    if result < 0:
        result += 24 * 60
    return result

def load_json(path):
    with open(path) as data:
        return json.load(data)

def flatten(input, fields):
    context = {}
    for line in input:
        record_type = int(line[0]) - 1
        values = {
            key: line[range[0] - 1 : range[1]]
            for key, range in fields[record_type].items()
        }
        context.update(values)
        if record_type == 2:
            yield context

def run():
    config = load_json('config.json')
    bins = list(config['bins'].items())
    activities = list(config['activities'].items())
    fields = config['fields']
    counts = [[0] * len(activities) for _ in range(60 * 24)]

    with open('raw_data.dat') as input:
        for record in flatten(input, fields):
            activity = int(record['ACTIVITY'])
            start = minutes(record['START'])
            stop = minutes(record['STOP'])
            weight = float(record['WT06'])

            for i, (_, codes) in enumerate(activities):
                if codes[0] <= activity <= codes[1]:
                    if (stop < start):
                        for minute in range(start, 60 * 24):
                            counts[minute][i] += weight
                        for minute in range(0, stop):
                            counts[minute][i] += weight
                    else:
                        for minute in range(start, stop):
                            counts[minute][i] += weight
    
    for row in counts:
        total = sum(row)
        if total == 0:
            continue
        for i in range(len(row)):
            row[i] /= total
    
    with open('day.csv', 'w') as output:
        columns = ['Minute'] + [name for name, _ in activities]
        writer = csv.writer(output, lineterminator='\n')
        writer.writerow(columns)

        for i, row in enumerate(counts):
            writer.writerow([i] + ["{0:.5f}".format(value) for value in row])
