import requests
import json
import os
import sys
import re
import smtplib
import ipaddress

from datetime import datetime
from email.mime.text import MIMEText
from os import path
from decimal import *

#Send a request to prometheus API
def get_top_prefixes():

    #New request
    r = requests.get("http://127.0.0.1:9090/api/v1/query",params=query)
    json_data = json.loads(r.text)

    #Read old_table data
    old_table = {}
    if os.path.exists(old_data_log_path):
        #Load old route table if it exists
        fh = open(old_data_log_path,"r")
        old_table = json.load(fh)
        fh.close()

    if 'data' not in json_data:
        #Error from prometheus
        print("Prometheus error")
        print(r.text)
        exit(0)

    #Send table data and return the mail body listing updates
    return bgp_table_update(json_data['data'],old_table)

def bgp_table_update(nets,old_table):

    #Mail body strings
    top_prefix = ""
    added_list = ""
    updated_list = ""
    removed_list = ""

    #Count operations
    updated = 0
    added = 0
    removed = 0

    #New table log
    #Will be written to old_data_log_path
    log_list = {}

    #List of used supernets in mail body

    for net_data in nets['result']:
        route = net_data['metric']

        log_list[route['prefix']] = {
                'prefix':route['prefix'],
                'nexthop':route['nexthop'],
                'aspath':route["aspath"],
                'community':route['communities'],
                'value':str(bitsConvert(net_data['value'][1]))
        }

        route['value'] = bitsConvert(net_data['value'][1])
        if old_table.get(route['prefix']) != None:
            #Route found in old table
            old_table.pop(route['prefix'])

            updated_list += "{}\n".format(print_prefix(route))
            updated += 1
        else:
            added_list += "{}\n".format(print_prefix(route))
            #Route wasn't in the old table
            added += 1

        #Will print top 10 prefixes by traffic(bytes) in the mail
        if (updated + added) <= 10:
            top_prefix += "{}\n".format(print_prefix(route))

        bgp_add_route(route) #Update or add route

    fh = open(old_data_log_path,"w") #Open log file to save the new table
    fh.write(json.dumps(log_list)) #Save log data
    fh.close()

    #Routes still in old_data are not in the new table, so we delete them
    old_table_keys = list(old_table)

    supernet = {}
    for key in old_table_keys:

        removed_list += "{}\n".format(print_prefix(old_table[key]))
        bgp_remove_route(old_table[key])
        removed += 1

    print("Added : {}\nUpdated : {}\nRemoved : {}".format(added,updated,removed))

    top_prefix_msg = "Sflow-rt prefixes updates :\nAdded : {}\nUpdated : {}\nRemoved : {}\n\nTop 10 prefixes({}) :\n{}\n\n".format(added,updated,removed,period,top_prefix)

    #Only show top prefixes if no route was removed
    top_prefix_msg += "Added prefixes :\n{}\nRemoved prefixes :\n{}\nUpdated prefixes :\n{}".format(added_list,removed_list,updated_list)

    #Save update in log path
    fh = open(log_path,"w")
    fh.write(top_prefix_msg)
    fh.close()

    return top_prefix_msg

def print_prefix(net):
    result_string = json.dumps(net)
    r_justify = 18

    #Print net for mail body
    result_string = "Prefix : " + str(net['prefix']).rjust(r_justify)
    result_string += " ,nexthop : " + str(net['nexthop']).rjust(r_justify)
    result_string += " ,value(bytes) : " + str(net['value']).rjust(r_justify)

    return result_string

#Add route using sflow-rt API
def bgp_add_route(route):

    cidr = route['prefix'].split("/")
    url = "http://127.0.0.1:"+ sflowrt_port +"/bgp/routepusher/"+ target_ip +"/"+cidr[0]+"/"+cidr[1]+"/json"
    r = requests.put(url,data=json.dumps(route))
    #print("Add : " + route['prefix'])

#Remove route using sflow-rt API
def bgp_remove_route(route):

    cidr = route['prefix'].split("/")
    url = "http://127.0.0.1:"+ sflowrt_port +"/bgp/routepusher/"+ target_ip +"/"+cidr[0]+"/"+cidr[1]+"/json"
    r = requests.delete(url)
    #print("Remove : "+ prefix)

#New syntax for bits values
def bitsConvert(value):

    getcontext().prec = 5

    result = Decimal(value)

    if result >= pow(10,9):
        result = Decimal(result) / pow(10,9)
        return str(result) + " G"
    if result >= pow(10,6):
        result = int(result / pow(10,6))
        return str(result) + " M"
    if result >= pow(10,3):
        result = int(result / pow(10,3))
        return str(result) + " K"
    return str(result) + " "


#Load json file to create a query filter
def get_filter():

    if os.path.exists(filter_path):
        fh = open(filter_path)
    else:
        #No filter found, we return an empty string
        return ""

    json_data = json.load(fh)
    output = ''

    if len(json_data["addresses"]) == 0:
        #Keep all prefixes
        return ""

    output = '{prefix!~"'
    output += '",prefix!~"'.join(json_data["addresses"])
    output += '}'

    return output

#Sending alert mails
def sendMail(send_to,send_from,send_msg):

    send_body = "Subject: Sflow-rt prefixes update\n{}".format(send_msg)
    #mail_to_list = send_to.split(',')

    s = smtplib.SMTP('localhost')
    #s.sendmail(send_from,mail_to_list,send_body)
    s.sendmail(send_from,send_to,send_body)
    s.quit()

if __name__ == '__main__':

    dt = datetime.now()
    conf_path = "./conf.d/sflow-rt.conf"
    filter_path = "./app/load_balancing/scripts/filter.json"
    old_data_log_path = "./app/load_balancing/scripts/table.log"
    log_path = "./app/load_balancing/log/update_{}T{}".format(dt.date().strftime("%Y%m%d"),dt.time().strftime("%H%M"))

    max_prefix = 100
    period = "24h"
    sflowrt_port = 8008

    mail_to = ""
    mail_from = ""

    conf_data = {}
    fh = open(conf_path,'r')
    for line in fh:
        line_data = line.split("=")
        if len(line_data) > 1:
            conf_data[line_data[0]] = line_data[1].strip()

    max_prefix = conf_data.get('arm.target.prefixes',"100")
    period = conf_data.get('arm.target.period',"24h")
    sflowrt_port = conf_data.get('http.port',"8008")
    target_ip = conf_data['arm.target.ip']

    mail_to = conf_data.get('arm.target.mail_to',None)
    mail_from = conf_data.get('plugins.mail.from',None)

    if not os.path.isdir("./app/load_balancing/log"):
        os.mkdir('./app/load_balancing/log')

    #Read filter
    query_filter = get_filter()
    #Prometheus request
    query = {"query":"sort_desc(round(topk("+ max_prefix +",sum_over_time(top_prefix"+ query_filter +"[" + period + "]))))"}
    mail_body = get_top_prefixes()

    if mail_to != None and mail_from != None:
        sendMail(mail_to,mail_from,mail_body)
